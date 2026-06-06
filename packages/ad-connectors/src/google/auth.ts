// Google Ads OAuth 2.0 connector
// Scopes: https://www.googleapis.com/auth/adwords
// Docs: https://developers.google.com/google-ads/api/docs/oauth/overview

import { db, encryptToken, decryptToken } from '@vigmis/db';
import type { AdConnector, OAuthTokens } from '../connector.interface.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Google Ads scopes only — Analytics is a separate OAuth flow
const SCOPES_ADS = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// Google Analytics scopes only — separate flow so different accounts can be used
const SCOPES_ANALYTICS = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const SCOPES = SCOPES_ADS; // default (kept for backward compat)

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI');
  }
  return { clientId, clientSecret, redirectUri };
}

export class GoogleAdsConnector implements AdConnector {
  readonly platform = 'google' as const;

  getAuthUrl(tenantId: string, state: string, flow: 'ads' | 'analytics' = 'ads'): string {
    const { clientId, redirectUri } = getConfig();
    const scope = flow === 'analytics' ? SCOPES_ANALYTICS : SCOPES_ADS;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: flow === 'analytics'
        ? redirectUri.replace('/auth/google/callback', '/auth/google/analytics/callback')
        : redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'select_account consent',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  getAnalyticsAuthUrl(tenantId: string, state: string): string {
    return this.getAuthUrl(tenantId, state, 'analytics');
  }

  async handleCallback(code: string, tenantId: string, platform: 'google' | 'google_analytics' = 'google'): Promise<OAuthTokens> {
    const { clientId, clientSecret, redirectUri } = getConfig();
    const callbackUri = platform === 'google_analytics'
      ? redirectUri.replace('/auth/google/callback', '/auth/google/analytics/callback')
      : redirectUri;

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google token exchange failed: ${body}`);
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scope: data.scope,
    };

    await this.persistTokens(tenantId, tokens, platform);
    return tokens;
  }

  async refreshTokens(tenantId: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = getConfig();

    const { data: row, error } = await db
      .from('platform_tokens')
      .select('refresh_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'google')
      .single();

    if (error || !row?.refresh_token) {
      throw new Error(`No Google refresh token found for tenant ${tenantId}`);
    }

    const refreshToken = decryptToken(row.refresh_token);

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google token refresh failed: ${body}`);
    }

    const data = await res.json() as {
      access_token: string;
      expires_in: number;
      scope: string;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken,  // unchanged
      expiresAt,
      scope: data.scope,
    };

    await this.persistTokens(tenantId, tokens);
    return tokens;
  }

  async validateConnection(tenantId: string): Promise<boolean> {
    const { data: row } = await db
      .from('platform_tokens')
      .select('expires_at, access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'google')
      .single();

    if (!row) return false;

    // If token has not expired, connection is valid
    if (row.expires_at && new Date(row.expires_at) > new Date()) return true;

    // Try to refresh
    try {
      await this.refreshTokens(tenantId);
      return true;
    } catch {
      return false;
    }
  }

  private async persistTokens(tenantId: string, tokens: OAuthTokens, platform: 'google' | 'google_analytics' = 'google') {
    const row = {
      tenant_id: tenantId,
      platform: platform as 'google',
      access_token: encryptToken(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      scope: tokens.scope ?? null,
      account_id: tokens.accountId ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('platform_tokens')
      .upsert(row, { onConflict: 'tenant_id,platform' });

    if (error) throw new Error(`Failed to persist Google tokens: ${error.message}`);
  }
}

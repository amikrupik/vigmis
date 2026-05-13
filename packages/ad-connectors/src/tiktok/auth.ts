// TikTok for Developers — OAuth 2.0 connector (Login Kit + Content Posting API)
// Docs: https://developers.tiktok.com/doc/login-kit-web/
//       https://developers.tiktok.com/doc/content-posting-api-get-started/
//
// Required env vars (Railway):
//   TIKTOK_CLIENT_KEY    — from TikTok Developers portal
//   TIKTOK_CLIENT_SECRET — from TikTok Developers portal
//   TIKTOK_REDIRECT_URI  — e.g. https://vigmisapi-production.up.railway.app/auth/tiktok/callback
//
// Scopes requested:
//   user.info.basic — read profile info (open_id, avatar, display name)
//   video.upload    — upload video to user's inbox draft (granted by default)
//   video.publish   — Direct Post to user's profile (requires audit approval)

import { db, encryptToken, decryptToken } from '@vigmis/db';
import type { AdConnector, OAuthTokens } from '../connector.interface.js';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

const SCOPES = ['user.info.basic', 'video.upload', 'video.publish'].join(',');

function getConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error('Missing TikTok OAuth environment variables: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI');
  }
  return { clientKey, clientSecret, redirectUri };
}

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

export class TikTokAdsConnector implements AdConnector {
  readonly platform = 'tiktok' as const;

  getAuthUrl(_tenantId: string, state: string): string {
    const { clientKey, redirectUri } = getConfig();
    const params = new URLSearchParams({
      client_key: clientKey,
      scope: SCOPES,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, tenantId: string): Promise<OAuthTokens> {
    const { clientKey, clientSecret, redirectUri } = getConfig();

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: body.toString(),
    });

    const json = (await res.json()) as TikTokTokenResponse;

    if (!res.ok || json.error || !json.access_token) {
      throw new Error(`TikTok token exchange failed: ${json.error_description ?? json.error ?? 'unknown error'}`);
    }

    const expiresAt = new Date(Date.now() + json.expires_in * 1000);

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
      scope: json.scope,
      accountId: json.open_id,
    };

    await this.persistTokens(tenantId, tokens);
    return tokens;
  }

  async refreshTokens(tenantId: string): Promise<OAuthTokens> {
    const { clientKey, clientSecret } = getConfig();

    const { data: row, error } = await db
      .from('platform_tokens')
      .select('refresh_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'tiktok')
      .single();

    if (error || !row?.refresh_token) {
      throw new Error(`No TikTok refresh token for tenant ${tenantId}`);
    }

    const refreshToken = decryptToken(row.refresh_token);

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: body.toString(),
    });

    const json = (await res.json()) as TikTokTokenResponse;

    if (!res.ok || json.error || !json.access_token) {
      throw new Error(`TikTok token refresh failed: ${json.error_description ?? json.error ?? 'unknown error'}`);
    }

    const expiresAt = new Date(Date.now() + json.expires_in * 1000);

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
      scope: json.scope,
      accountId: json.open_id,
    };

    await this.persistTokens(tenantId, tokens);
    return tokens;
  }

  async validateConnection(tenantId: string): Promise<boolean> {
    const { data: row } = await db
      .from('platform_tokens')
      .select('expires_at, access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'tiktok')
      .single();

    if (!row) return false;
    if (row.expires_at && new Date(row.expires_at) > new Date()) return true;

    try {
      await this.refreshTokens(tenantId);
      return true;
    } catch {
      return false;
    }
  }

  private async persistTokens(tenantId: string, tokens: OAuthTokens) {
    const row = {
      tenant_id: tenantId,
      platform: 'tiktok' as const,
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

    if (error) throw new Error(`Failed to persist TikTok tokens: ${error.message}`);
  }
}

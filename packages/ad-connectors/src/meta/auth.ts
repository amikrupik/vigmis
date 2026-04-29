// Meta (Facebook) Business Manager OAuth connector
// Scopes: public_profile, email, ads_read, ads_management, pages_show_list, pages_read_engagement, business_management
// Docs: https://developers.facebook.com/docs/marketing-api/overview/authorization

import { db, encryptToken, decryptToken } from '@vigmis/db';
import type { AdConnector, OAuthTokens } from '../connector.interface.js';

const META_API_VERSION = 'v19.0';
const META_AUTH_URL = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;
const META_TOKEN_URL = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`;
const META_EXCHANGE_URL = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`;
const SCOPES = [
  'public_profile',
  'ads_read',
  'ads_management',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

function getConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Missing Meta OAuth environment variables: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI');
  }
  return { appId, appSecret, redirectUri };
}

export class MetaAdsConnector implements AdConnector {
  readonly platform = 'meta' as const;

  getAuthUrl(tenantId: string, state: string): string {
    const { appId, redirectUri } = getConfig();
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      response_type: 'code',
      state,
    });
    return `${META_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, tenantId: string): Promise<OAuthTokens> {
    const { appId, appSecret, redirectUri } = getConfig();

    // Exchange code for short-lived token
    const shortRes = await fetch(
      `${META_TOKEN_URL}?${new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      })}`,
    );

    if (!shortRes.ok) {
      const body = await shortRes.text();
      throw new Error(`Meta token exchange failed: ${body}`);
    }

    const shortData = await shortRes.json() as { access_token: string };

    // Exchange short-lived for long-lived token (60 days)
    const longRes = await fetch(
      `${META_EXCHANGE_URL}?${new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortData.access_token,
      })}`,
    );

    if (!longRes.ok) {
      const body = await longRes.text();
      throw new Error(`Meta long-lived token exchange failed: ${body}`);
    }

    const longData = await longRes.json() as {
      access_token: string;
      token_type: string;
      expires_in?: number;
    };

    // Meta long-lived tokens last ~60 days
    const expiresAt = longData.expires_in
      ? new Date(Date.now() + longData.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const tokens: OAuthTokens = {
      accessToken: longData.access_token,
      expiresAt,
      scope: SCOPES,
    };

    await this.persistTokens(tenantId, tokens);
    return tokens;
  }

  async refreshTokens(tenantId: string): Promise<OAuthTokens> {
    // Meta: re-exchange the existing long-lived token for a fresh one
    const { appId, appSecret } = getConfig();

    const { data: row, error } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'meta')
      .single();

    if (error || !row) {
      throw new Error(`No Meta token found for tenant ${tenantId}`);
    }

    const currentToken = decryptToken(row.access_token);

    const res = await fetch(
      `${META_EXCHANGE_URL}?${new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: currentToken,
      })}`,
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta token refresh failed: ${body}`);
    }

    const data = await res.json() as { access_token: string; expires_in?: number };
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const tokens: OAuthTokens = { accessToken: data.access_token, expiresAt };
    await this.persistTokens(tenantId, tokens);
    return tokens;
  }

  async validateConnection(tenantId: string): Promise<boolean> {
    const { data: row } = await db
      .from('platform_tokens')
      .select('expires_at, access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'meta')
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
      platform: 'meta' as const,
      access_token: encryptToken(tokens.accessToken),
      refresh_token: null, // Meta uses token re-exchange, no refresh_token
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      scope: tokens.scope ?? null,
      account_id: tokens.accountId ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('platform_tokens')
      .upsert(row, { onConflict: 'tenant_id,platform' });

    if (error) throw new Error(`Failed to persist Meta tokens: ${error.message}`);
  }
}

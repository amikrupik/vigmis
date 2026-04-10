// TikTok for Business Marketing API — OAuth 2.0 connector
// Docs: https://business-api.tiktok.com/portal/docs?id=1738373164380162
//
// Required env vars (add to Railway when TikTok app is approved):
//   TIKTOK_APP_ID       — from TikTok for Business developer portal
//   TIKTOK_APP_SECRET   — from TikTok for Business developer portal
//   TIKTOK_REDIRECT_URI — e.g. https://vigmisapi-production.up.railway.app/auth/tiktok/callback
//
// Scopes needed:
//   advertiser.read     — read advertiser info
//   campaign.read       — read campaign performance
//   campaign.create     — create/update campaigns

import { db, encryptToken, decryptToken } from '@vigmis/db';
import type { AdConnector, OAuthTokens } from '../connector.interface.js';

const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
const TIKTOK_TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
const TIKTOK_REFRESH_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/';

function getConfig() {
  const appId = process.env.TIKTOK_APP_ID;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Missing TikTok OAuth environment variables: TIKTOK_APP_ID, TIKTOK_APP_SECRET, TIKTOK_REDIRECT_URI');
  }
  return { appId, appSecret, redirectUri };
}

export class TikTokAdsConnector implements AdConnector {
  readonly platform = 'tiktok' as const;

  getAuthUrl(tenantId: string, state: string): string {
    const { appId, redirectUri } = getConfig();
    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: redirectUri,
      state,
      // TikTok does not use a scope param in the URL — scopes are configured in app settings
    });
    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, tenantId: string): Promise<OAuthTokens> {
    const { appId, appSecret, redirectUri } = getConfig();

    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        secret: appSecret,
        auth_code: code,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TikTok token exchange failed: ${body}`);
    }

    const json = await res.json() as {
      code: number;
      message: string;
      data?: {
        access_token: string;
        refresh_token: string;
        access_token_expire_in: number;    // seconds
        refresh_token_expire_in: number;
        advertiser_ids: string[];
        scope: string[];
      };
    };

    if (json.code !== 0 || !json.data) {
      throw new Error(`TikTok token exchange error: ${json.message}`);
    }

    const d = json.data;
    const expiresAt = new Date(Date.now() + d.access_token_expire_in * 1000);

    const tokens: OAuthTokens = {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt,
      scope: d.scope?.join(','),
      accountId: d.advertiser_ids?.[0] ?? undefined,
    };

    await this.persistTokens(tenantId, tokens);
    return tokens;
  }

  async refreshTokens(tenantId: string): Promise<OAuthTokens> {
    const { appId, appSecret } = getConfig();

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

    const res = await fetch(TIKTOK_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        secret: appSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TikTok token refresh failed: ${body}`);
    }

    const json = await res.json() as {
      code: number;
      message: string;
      data?: {
        access_token: string;
        refresh_token: string;
        access_token_expire_in: number;
        refresh_token_expire_in: number;
      };
    };

    if (json.code !== 0 || !json.data) {
      throw new Error(`TikTok token refresh error: ${json.message}`);
    }

    const d = json.data;
    const expiresAt = new Date(Date.now() + d.access_token_expire_in * 1000);

    const tokens: OAuthTokens = {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt,
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

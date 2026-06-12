// OAuth routes for Google Ads and Meta Ads
//
// GET  /auth/google           → redirect to Google consent screen
// GET  /auth/google/callback  → exchange code, save tokens
// GET  /auth/meta             → redirect to Meta consent screen (scopes: public_profile,ads_read,ads_management,pages_show_list,pages_read_engagement,business_management)
// GET  /auth/meta/callback    → exchange code, save tokens
// GET  /auth/status           → which platforms are connected

import type { FastifyInstance } from 'fastify';
import { GoogleAdsConnector, MetaAdsConnector, TikTokAdsConnector } from '@vigmis/ad-connectors';
import { db, decryptToken } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { fetchAndStoreHistoricalData } from '../services/historical.js';
import crypto from 'crypto';

const META_API_VERSION = 'v19.0';
const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

const google = new GoogleAdsConnector();
const meta = new MetaAdsConnector();
const tiktok = new TikTokAdsConnector();

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Temporary in-memory store for OAuth state validation (use Redis in production)
const pendingStates = new Map<string, { tenantId: string; platform: string; expiresAt: number; codeVerifier?: string; returnTo?: string }>();

function generateState(tenantId: string, platform: string, codeVerifier?: string, returnTo?: string): string {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { tenantId, platform, expiresAt: Date.now() + 10 * 60 * 1000, codeVerifier, returnTo });
  return state;
}

function consumeState(state: string): { tenantId: string; platform: string; codeVerifier?: string; returnTo?: string } | null {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { tenantId: entry.tenantId, platform: entry.platform, codeVerifier: entry.codeVerifier };
}

// PKCE helpers for TikTok v2 OAuth
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export async function connectorRoutes(app: FastifyInstance) {
  // ─── Google Ads ────────────────────────────────────────────────────────────

  app.get('/auth/google', { preHandler: authenticate }, async (request, reply) => {
    const { return: returnTo } = request.query as Record<string, string>;
    const state = generateState(request.tenantId, 'google', undefined, returnTo);
    const url = google.getAuthUrl(request.tenantId, state, 'ads');
    return reply.redirect(url);
  });

  app.get('/auth/google/callback', async (request, reply) => {
    const { code, state, error } = request.query as Record<string, string>;

    if (error) {
      return reply.redirect(`${WEB_URL}/onboarding?error=google_denied`);
    }

    const stateData = consumeState(state);
    if (!stateData || stateData.platform !== 'google') {
      return reply.redirect(`${WEB_URL}/onboarding?error=invalid_state`);
    }

    const returnToDashboard = stateData.returnTo === 'dashboard';

    try {
      await google.handleCallback(code, stateData.tenantId);

      await db.from('audit_log').insert({
        tenant_id: stateData.tenantId,
        action: 'connector.google.connected',
        platform: 'google',
        actor: 'user',
        payload: {},
      });

      fetchAndStoreHistoricalData(stateData.tenantId, 'google').catch(() => {});

      const redirectTo = returnToDashboard
        ? `${WEB_URL}/dashboard?connected=google`
        : `${WEB_URL}/onboarding?connected=google`;
      return reply.redirect(redirectTo);
    } catch (err) {
      app.log.error({ err }, 'Google OAuth callback failed');
      const errorTo = returnToDashboard
        ? `${WEB_URL}/dashboard?error=google_failed`
        : `${WEB_URL}/onboarding?error=google_failed`;
      return reply.redirect(errorTo);
    }
  });

  // ─── Google: list ad accounts + select one ────────────────────────────────

  app.get('/connectors/google/accounts', { preHandler: authenticate }, async (request, reply) => {
    try {
      const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      if (!devToken) return reply.code(503).send({ error: 'Google Ads developer token not configured' });

      const { data: tokenRow } = await db
        .from('platform_tokens')
        .select('access_token, account_id')
        .eq('tenant_id', request.tenantId)
        .eq('platform', 'google')
        .maybeSingle();

      if (!tokenRow) return reply.code(404).send({ error: 'Google not connected' });

      const { decryptToken } = await import('@vigmis/db');
      const accessToken = decryptToken(tokenRow.access_token);

      const res = await fetch(
        `https://googleads.googleapis.com/v20/customers:listAccessibleCustomers`,
        { headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': devToken } }
      );

      if (!res.ok) {
        const body = await res.text();
        app.log.error({ body }, 'Google listAccessibleCustomers failed');
        return reply.code(502).send({ error: 'Could not load Google Ads accounts' });
      }

      const json = await res.json() as { resourceNames: string[] };
      const ids = (json.resourceNames ?? []).map((r: string) => r.split('/')[1]);

      // Fetch name + status for each account in parallel (best-effort; fall back to ID if it fails).
      const accounts = await Promise.all(ids.map(async (id) => {
        try {
          const detailRes = await fetch(
            `https://googleads.googleapis.com/v20/customers/${id}/googleAds:search`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'developer-token': devToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.status FROM customer LIMIT 1' }),
            },
          );
          if (!detailRes.ok) return { id, name: `Google Ads — ${id}`, status: 'UNKNOWN' };
          const detail = await detailRes.json() as { results?: Array<{ customer: { descriptiveName?: string; status?: string } }> };
          const customer = detail.results?.[0]?.customer ?? {};
          return {
            id,
            name: customer.descriptiveName || `Google Ads — ${id}`,
            status: customer.status ?? 'UNKNOWN',
          };
        } catch {
          return { id, name: `Google Ads — ${id}`, status: 'UNKNOWN' };
        }
      }));

      return reply.send({ accounts, selected: tokenRow.account_id ?? null });
    } catch (err) {
      app.log.error({ err }, 'Google accounts list failed');
      return reply.code(500).send({ error: 'Failed to load accounts' });
    }
  });

  app.post('/connectors/google/select-account', { preHandler: authenticate }, async (request, reply) => {
    const { accountId } = request.body as { accountId: string };
    if (!accountId) return reply.code(400).send({ error: 'accountId required' });

    await db
      .from('platform_tokens')
      .update({ account_id: accountId })
      .eq('tenant_id', request.tenantId)
      .eq('platform', 'google');

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'connector.google.account_selected',
      platform: 'google',
      actor: 'user',
      payload: { accountId },
    });

    return reply.send({ success: true });
  });

  // ─── Google Analytics (separate OAuth flow) ────────────────────────────────

  app.get('/auth/google/analytics', { preHandler: authenticate }, async (request, reply) => {
    const state = generateState(request.tenantId, 'google_analytics');
    const url = google.getAnalyticsAuthUrl(request.tenantId, state);
    return reply.redirect(url);
  });

  app.get('/auth/google/analytics/callback', async (request, reply) => {
    const { code, state, error } = request.query as Record<string, string>;

    if (error) return reply.redirect(`${WEB_URL}/onboarding?error=analytics_denied`);

    const stateData = consumeState(state);
    if (!stateData || stateData.platform !== 'google_analytics') {
      return reply.redirect(`${WEB_URL}/onboarding?error=invalid_state`);
    }

    try {
      // Store analytics token separately with platform = 'google_analytics'
      await google.handleCallback(code, stateData.tenantId, 'google_analytics');

      await db.from('audit_log').insert({
        tenant_id: stateData.tenantId,
        action: 'connector.google_analytics.connected',
        platform: 'google_analytics',
        actor: 'user',
        payload: {},
      });

      return reply.redirect(`${WEB_URL}/onboarding?connected=google_analytics`);
    } catch (err) {
      app.log.error({ err }, 'Google Analytics OAuth callback failed');
      return reply.redirect(`${WEB_URL}/onboarding?error=analytics_failed`);
    }
  });

  // ─── Meta ──────────────────────────────────────────────────────────────────

  app.get('/auth/meta', { preHandler: authenticate }, async (request, reply) => {
    const state = generateState(request.tenantId, 'meta');
    const url = meta.getAuthUrl(request.tenantId, state);
    return reply.redirect(url);
  });

  app.get('/auth/meta/callback', async (request, reply) => {
    const { code, state, error } = request.query as Record<string, string>;

    if (error) {
      return reply.redirect(`${WEB_URL}/onboarding?error=meta_denied`);
    }

    const stateData = consumeState(state);
    if (!stateData || stateData.platform !== 'meta') {
      return reply.redirect(`${WEB_URL}/onboarding?error=invalid_state`);
    }

    try {
      await meta.handleCallback(code, stateData.tenantId);

      await db.from('audit_log').insert({
        tenant_id: stateData.tenantId,
        action: 'connector.meta.connected',
        platform: 'meta',
        actor: 'user',
        payload: {},
      });

      // Fire-and-forget: pull last 30 days of historical data
      fetchAndStoreHistoricalData(stateData.tenantId, 'meta').catch(() => {});

      return reply.redirect(`${WEB_URL}/onboarding?connected=meta`);
    } catch (err) {
      app.log.error({ err }, 'Meta OAuth callback failed');
      return reply.redirect(`${WEB_URL}/onboarding?error=meta_failed`);
    }
  });

  // ─── TikTok ────────────────────────────────────────────────────────────────
  // NOTE: TikTok OAuth activates once TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and
  // TIKTOK_REDIRECT_URI are set in Railway env vars.

  app.get('/auth/tiktok', { preHandler: authenticate }, async (request, reply) => {
    try {
      // TikTok v2 — no PKCE (causes token exchange failure with this app config)
      const state = generateState(request.tenantId, 'tiktok');
      const url = tiktok.getAuthUrl(request.tenantId, state);
      return reply.redirect(url);
    } catch (err) {
      app.log.warn({ err }, 'TikTok OAuth not configured');
      return reply.redirect(`${WEB_URL}/onboarding?error=tiktok_not_configured`);
    }
  });

  app.get('/auth/tiktok/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query as Record<string, string>;

    if (error) {
      app.log.warn({ error, error_description }, 'TikTok OAuth denied by user or platform');
      return reply.redirect(`${WEB_URL}/onboarding?error=tiktok_denied`);
    }

    const stateData = consumeState(state);
    if (!stateData || stateData.platform !== 'tiktok') {
      return reply.redirect(`${WEB_URL}/onboarding?error=invalid_state`);
    }

    try {
      await tiktok.handleCallback(code, stateData.tenantId);

      await db.from('audit_log').insert({
        tenant_id: stateData.tenantId,
        action: 'connector.tiktok.connected',
        platform: 'tiktok',
        actor: 'user',
        payload: {},
      });

      fetchAndStoreHistoricalData(stateData.tenantId, 'tiktok').catch(() => {});

      return reply.redirect(`${WEB_URL}/onboarding?connected=tiktok`);
    } catch (err) {
      app.log.error({ err }, 'TikTok OAuth callback failed');
      return reply.redirect(`${WEB_URL}/onboarding?error=tiktok_failed`);
    }
  });

  // ─── Disconnect Meta — revoke + wipe token + clear page selections ─────
  app.post('/connectors/meta/disconnect', { preHandler: authenticate }, async (request, reply) => {
    const { data: tokenRow } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', request.tenantId)
      .eq('platform', 'meta')
      .maybeSingle();

    // Best-effort revoke at Facebook so Vigmis disappears from the user's apps page.
    if (tokenRow?.access_token) {
      try {
        const access = decryptToken(tokenRow.access_token);
        await fetch(`${META_GRAPH}/me/permissions?access_token=${encodeURIComponent(access)}`, { method: 'DELETE' });
      } catch (err) {
        request.log.warn({ err }, 'Meta revoke during disconnect failed (continuing)');
      }
    }

    await db.from('platform_tokens').delete()
      .eq('tenant_id', request.tenantId).eq('platform', 'meta');

    // Clear Page selections so the next reconnect doesn't reuse stale IDs.
    await db.from('social_settings').update({
      facebook_page_id: null,
      instagram_user_id: null,
      platforms: [],
      enabled: false,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', request.tenantId);

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'connector.meta.disconnected',
      platform: 'meta',
      actor: 'user',
      payload: {},
    });

    return reply.send({ success: true });
  });

  // ─── Meta token introspection — what scopes does the current token actually grant? ──
  // Helps debug "pages_manage_posts required" errors after re-adding scopes:
  // surfaces whether the user's stored token already covers the scope or whether they
  // need to disconnect + reconnect to pick up new ones.
  app.get('/connectors/meta/scopes', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', request.tenantId)
      .eq('platform', 'meta')
      .maybeSingle();
    if (!data?.access_token) return reply.send({ connected: false, scopes: [] });

    const access = decryptToken(data.access_token);
    // /debug_token wants an APP access token (or admin/dev token) in the access_token
    // parameter — passing the same user token gives an empty scopes list back.
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return reply.code(500).send({ error: 'Meta app credentials missing on the server' });
    }
    const appAccess = `${appId}|${appSecret}`;
    try {
      const res = await fetch(`${META_GRAPH}/debug_token?input_token=${encodeURIComponent(access)}&access_token=${encodeURIComponent(appAccess)}`);
      const json = (await res.json()) as { data?: { scopes?: string[]; is_valid?: boolean } };
      const granted = json.data?.scopes ?? [];
      const required = [
        'public_profile', 'ads_read', 'ads_management',
        'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
        'business_management',
        'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments',
      ];
      const missing = required.filter(s => !granted.includes(s));
      return reply.send({
        connected: json.data?.is_valid !== false,
        scopes: granted,
        missing,
        needs_reconnect: missing.length > 0,
      });
    } catch (err) {
      request.log.error({ err }, 'Meta debug_token failed');
      return reply.code(500).send({ error: 'Failed to inspect Meta token' });
    }
  });

  // ─── Status ────────────────────────────────────────────────────────────────

  app.get('/auth/status', { preHandler: authenticate }, async (request, reply) => {
    const { data: tokens } = await db
      .from('platform_tokens')
      .select('platform, expires_at, refresh_token')
      .eq('tenant_id', request.tenantId);

    const status = { google: false, meta: false, tiktok: false };
    for (const token of tokens ?? []) {
      const notExpired = token.expires_at ? new Date(token.expires_at) > new Date() : true;
      const canRefresh = !!token.refresh_token;
      // Connected if token is valid OR a refresh_token exists (auto-refresh will run on next use)
      if ((notExpired || canRefresh) && token.platform in status) {
        status[token.platform as keyof typeof status] = true;
      }
    }

    // Indicate whether TikTok is configured server-side (env vars present)
    const tiktokConfigured = !!(
      process.env.TIKTOK_CLIENT_KEY &&
      process.env.TIKTOK_CLIENT_SECRET &&
      process.env.TIKTOK_REDIRECT_URI
    );

    return reply.send({ ...status, tiktok_available: tiktokConfigured });
  });

  // ─── Meta Ad Accounts ─────────────────────────────────────────────────────
  // List ad accounts the user has access to + which one Vigmis will use.
  // Registered under both spellings (hyphen + no-hyphen) for compatibility.

  async function handleMetaAdAccounts(request: any, reply: any) {
    const { data: tokenRow } = await db
      .from('platform_tokens')
      .select('access_token, account_id')
      .eq('tenant_id', request.tenantId)
      .eq('platform', 'meta')
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return reply.code(400).send({ error: 'Meta is not connected' });
    }

    const token = decryptToken(tokenRow.access_token);

    try {
      const res = await fetch(
        `${META_GRAPH}/me/adaccounts?fields=id,name,account_id,account_status,currency,business&limit=50&access_token=${token}`,
      );
      if (!res.ok) {
        const body = await res.text();
        request.log.error({ body }, 'Meta /me/adaccounts failed');
        const detail = body.includes('<!DOCTYPE') || body.includes('<html')
          ? 'Meta token may be expired — please reconnect Meta'
          : body.slice(0, 300);
        return reply.code(502).send({ error: 'Meta API error', detail });
      }
      const json = (await res.json()) as { data?: Array<{ id: string; name: string; account_status?: number; currency?: string; business?: { name?: string } }> };
      const accounts = (json.data ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        currency: a.currency ?? null,
        active: a.account_status === 1,
        business: a.business?.name ?? null,
      }));
      return reply.send({ accounts, selected: tokenRow.account_id ?? null });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch Meta ad accounts');
      return reply.code(500).send({ error: 'Failed to fetch ad accounts' });
    }
  }

  app.get('/connectors/meta/ad-accounts', { preHandler: authenticate }, handleMetaAdAccounts);
  app.get('/connectors/meta/adaccounts', { preHandler: authenticate }, handleMetaAdAccounts);

  // List Facebook Pages + connected Instagram Business accounts
  app.get('/connectors/meta/pages', { preHandler: authenticate }, async (request, reply) => {
    const { data: tokenRow } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', request.tenantId)
      .eq('platform', 'meta')
      .maybeSingle();
    if (!tokenRow?.access_token) return reply.code(400).send({ error: 'Meta is not connected' });
    const token = decryptToken(tokenRow.access_token);

    try {
      // /me/accounts returns Pages this user manages. For each, we ask for the linked IG business account.
      const res = await fetch(
        `${META_GRAPH}/me/accounts?fields=id,name,category,instagram_business_account{id,username}&limit=100&access_token=${token}`,
      );
      if (!res.ok) {
        const body = await res.text();
        request.log.error({ body }, 'Meta /me/accounts failed');
        return reply.code(502).send({ error: 'Meta API error', detail: body.slice(0, 300) });
      }
      const json = (await res.json()) as {
        data?: Array<{
          id: string; name: string; category?: string;
          instagram_business_account?: { id: string; username?: string };
        }>;
      };
      const pages = (json.data ?? []).map(p => ({
        page_id: p.id,
        name: p.name,
        category: p.category ?? null,
        instagram_user_id: p.instagram_business_account?.id ?? null,
        instagram_username: p.instagram_business_account?.username ?? null,
      }));
      // Read current selections from social_settings
      const { data: settings } = await db
        .from('social_settings')
        .select('facebook_page_id, instagram_user_id')
        .eq('tenant_id', request.tenantId)
        .maybeSingle();
      return reply.send({
        pages,
        selected_page_id: settings?.facebook_page_id ?? null,
        selected_instagram_user_id: settings?.instagram_user_id ?? null,
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch Meta pages');
      return reply.code(500).send({ error: 'Failed to fetch pages' });
    }
  });

  // Select Facebook Page + (optional) linked Instagram in one call
  app.post<{ Body: { facebook_page_id: string; instagram_user_id?: string | null } }>(
    '/connectors/meta/page',
    { preHandler: authenticate }, async (request, reply) => {
      const { facebook_page_id, instagram_user_id } = request.body ?? ({} as any);
      if (!facebook_page_id) return reply.code(400).send({ error: 'facebook_page_id required' });

      // Build the platforms JSONB array that the weekly-generator reads.
      // Empty array => generate skips this tenant ("Social media is not configured").
      const platforms: Array<{ platform: string; enabled: boolean; page_id: string | null }> = [
        { platform: 'facebook', enabled: true, page_id: facebook_page_id },
      ];
      if (instagram_user_id) {
        platforms.push({ platform: 'instagram', enabled: true, page_id: instagram_user_id });
      }

      // Upsert into social_settings (the publisher reads these fields)
      const { error } = await db.from('social_settings').upsert({
        tenant_id: request.tenantId,
        facebook_page_id,
        instagram_user_id: instagram_user_id ?? null,
        platforms,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });

      if (error) {
        request.log.error({ error }, 'Failed to save Meta page selection');
        return reply.code(500).send({ error: 'Failed to save page selection' });
      }

      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'connector.meta.page_selected',
        platform: 'meta',
        actor: 'user',
        payload: { facebook_page_id, instagram_user_id: instagram_user_id ?? null },
      });

      return reply.send({ success: true });
    },
  );

  app.post<{ Body: { account_id: string } }>(
    '/connectors/meta/ad-account',
    { preHandler: authenticate },
    async (request, reply) => {
      const { account_id } = request.body ?? ({} as any);
      if (!account_id || !/^act_\d+$/.test(account_id)) {
        return reply.code(400).send({ error: 'account_id must look like "act_123456789"' });
      }

      const { error } = await db
        .from('platform_tokens')
        .update({ account_id, updated_at: new Date().toISOString() })
        .eq('tenant_id', request.tenantId)
        .eq('platform', 'meta');

      if (error) {
        request.log.error({ error }, 'Failed to persist Meta ad account selection');
        return reply.code(500).send({ error: 'Failed to save ad account' });
      }

      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'connector.meta.ad_account_selected',
        platform: 'meta',
        actor: 'user',
        payload: { account_id },
      });

      return reply.send({ success: true });
    },
  );
}

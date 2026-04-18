// OAuth routes for Google Ads and Meta Ads
//
// GET  /auth/google           → redirect to Google consent screen
// GET  /auth/google/callback  → exchange code, save tokens
// GET  /auth/meta             → redirect to Meta consent screen
// GET  /auth/meta/callback    → exchange code, save tokens
// GET  /auth/status           → which platforms are connected

import type { FastifyInstance } from 'fastify';
import { GoogleAdsConnector, MetaAdsConnector, TikTokAdsConnector } from '@vigmis/ad-connectors';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { fetchAndStoreHistoricalData } from '../services/historical.js';
import crypto from 'crypto';

const google = new GoogleAdsConnector();
const meta = new MetaAdsConnector();
const tiktok = new TikTokAdsConnector();

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Temporary in-memory store for OAuth state validation (use Redis in production)
const pendingStates = new Map<string, { tenantId: string; platform: string; expiresAt: number }>();

function generateState(tenantId: string, platform: string): string {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { tenantId, platform, expiresAt: Date.now() + 10 * 60 * 1000 });
  return state;
}

function consumeState(state: string): { tenantId: string; platform: string } | null {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { tenantId: entry.tenantId, platform: entry.platform };
}

export async function connectorRoutes(app: FastifyInstance) {
  // ─── Google ────────────────────────────────────────────────────────────────

  app.get('/auth/google', { preHandler: authenticate }, async (request, reply) => {
    const state = generateState(request.tenantId, 'google');
    const url = google.getAuthUrl(request.tenantId, state);
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

    try {
      await google.handleCallback(code, stateData.tenantId);

      await db.from('audit_log').insert({
        tenant_id: stateData.tenantId,
        action: 'connector.google.connected',
        platform: 'google',
        actor: 'user',
        payload: {},
      });

      // Fire-and-forget: pull last 30 days of historical data
      fetchAndStoreHistoricalData(stateData.tenantId, 'google').catch(() => {});

      return reply.redirect(`${WEB_URL}/onboarding?connected=google`);
    } catch (err) {
      app.log.error({ err }, 'Google OAuth callback failed');
      return reply.redirect(`${WEB_URL}/onboarding?error=google_failed`);
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
      const state = generateState(request.tenantId, 'tiktok');
      const url = tiktok.getAuthUrl(request.tenantId, state);
      return reply.redirect(url);
    } catch (err) {
      // TikTok env vars not configured yet
      app.log.warn({ err }, 'TikTok OAuth not configured');
      return reply.redirect(`${WEB_URL}/onboarding?error=tiktok_not_configured`);
    }
  });

  app.get('/auth/tiktok/callback', async (request, reply) => {
    const { auth_code, state, error } = request.query as Record<string, string>;

    if (error) {
      return reply.redirect(`${WEB_URL}/onboarding?error=tiktok_denied`);
    }

    const stateData = consumeState(state);
    if (!stateData || stateData.platform !== 'tiktok') {
      return reply.redirect(`${WEB_URL}/onboarding?error=invalid_state`);
    }

    try {
      await tiktok.handleCallback(auth_code, stateData.tenantId);

      await db.from('audit_log').insert({
        tenant_id: stateData.tenantId,
        action: 'connector.tiktok.connected',
        platform: 'tiktok',
        actor: 'user',
        payload: {},
      });

      // Fire-and-forget: pull last 30 days of historical data
      fetchAndStoreHistoricalData(stateData.tenantId, 'tiktok').catch(() => {});

      return reply.redirect(`${WEB_URL}/onboarding?connected=tiktok`);
    } catch (err) {
      app.log.error({ err }, 'TikTok OAuth callback failed');
      return reply.redirect(`${WEB_URL}/onboarding?error=tiktok_failed`);
    }
  });

  // ─── Status ────────────────────────────────────────────────────────────────

  app.get('/auth/status', { preHandler: authenticate }, async (request, reply) => {
    const { data: tokens } = await db
      .from('platform_tokens')
      .select('platform, expires_at')
      .eq('tenant_id', request.tenantId);

    const status = { google: false, meta: false, tiktok: false };
    for (const token of tokens ?? []) {
      const valid = token.expires_at ? new Date(token.expires_at) > new Date() : true;
      if (valid && token.platform in status) {
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
}

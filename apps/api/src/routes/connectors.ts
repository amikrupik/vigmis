// OAuth routes for Google Ads and Meta Ads
//
// GET  /auth/google           → redirect to Google consent screen
// GET  /auth/google/callback  → exchange code, save tokens
// GET  /auth/meta             → redirect to Meta consent screen
// GET  /auth/meta/callback    → exchange code, save tokens
// GET  /auth/status           → which platforms are connected

import type { FastifyInstance } from 'fastify';
import { GoogleAdsConnector } from '@vigmis/ad-connectors';
import { MetaAdsConnector } from '@vigmis/ad-connectors';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const google = new GoogleAdsConnector();
const meta = new MetaAdsConnector();

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

      return reply.redirect(`${WEB_URL}/onboarding?connected=meta`);
    } catch (err) {
      app.log.error({ err }, 'Meta OAuth callback failed');
      return reply.redirect(`${WEB_URL}/onboarding?error=meta_failed`);
    }
  });

  // ─── Status ────────────────────────────────────────────────────────────────

  app.get('/auth/status', { preHandler: authenticate }, async (request, reply) => {
    const { data: tokens } = await db
      .from('platform_tokens')
      .select('platform, expires_at')
      .eq('tenant_id', request.tenantId);

    const status = { google: false, meta: false };
    for (const token of tokens ?? []) {
      const valid = token.expires_at ? new Date(token.expires_at) > new Date() : true;
      if (valid) status[token.platform as 'google' | 'meta'] = true;
    }

    return reply.send(status);
  });
}

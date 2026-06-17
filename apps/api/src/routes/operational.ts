// Operational Awareness routes — context, weather sensitivity, news alerts.
//
// GET  /ops/context                     → calendar+weather+news synthesized
// GET  /ops/news                        → list news alerts for tenant
// POST /ops/news/:id/dismiss            → mark alert as dismissed
// PUT  /ops/weather-sensitivity         → set per-business weather profile
// POST /ops/cron/news-scan              → cron-protected
// POST /ops/cron/weather                → cron-protected
// POST /ops/cron/shopify-sync           → cron-protected nightly Shopify full sync
// POST /ops/cron/ai-landscape           → monthly digest email to team (1st of month)
// POST /ops/cron/ghost-cleanup          → warn/remind inactive tenants with no campaigns
// POST /ops/cron/creative-discard       → auto-reject unreviewed creative_jobs after 7 days

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { getOperationalContext } from '../services/operational-awareness.js';
import { scanNewsForTenant, dispatchNewsScanCron } from '../services/news-monitor.js';
import { refreshWeatherForTenant, dispatchWeatherCron } from '../services/weather.js';
import { dispatchShopifySyncCron } from '../services/shopify-sync.js';
import { runAiLandscapeDigest } from '../services/ai-landscape.js';
import { runGhostCleanup, runCreativeDiscard } from '../services/maintenance.js';
import { hasValidCronSecret } from '../middleware/secrets.js';
import { sendOperatorAlert } from '../services/operator-alert.js';

function cronAuth(req: FastifyRequest): boolean {
  return hasValidCronSecret(req);
}

const SensitivityBody = z.object({
  weather_sensitive: z.boolean(),
  weather_sensitivity: z.object({
    hot_boost:     z.boolean().optional(),
    rain_dampens:  z.boolean().optional(),
    rain_boosts:   z.boolean().optional(),
    cold_dampens:  z.boolean().optional(),
    cold_boosts:   z.boolean().optional(),
  }).optional(),
});

export async function operationalRoutes(app: FastifyInstance) {
  app.get('/ops/context', { preHandler: authenticate }, async (request, reply) => {
    const ctx = await getOperationalContext(request.tenantId);
    return reply.send(ctx);
  });

  app.get('/ops/news', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db.from('news_alerts')
      .select('id, source, source_url, title, description, published_at, relevance_score, category, why_relevant, suggested_action, status, fetched_at')
      .eq('tenant_id', request.tenantId)
      .neq('status', 'dismissed')
      .order('relevance_score', { ascending: false })
      .limit(50);
    return reply.send({ alerts: data ?? [] });
  });

  app.post('/ops/news/:id/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.from('news_alerts')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('tenant_id', request.tenantId);
    return reply.send({ success: true });
  });

  app.put('/ops/weather-sensitivity', { preHandler: authenticate }, async (request, reply) => {
    const parse = SensitivityBody.safeParse(request.body);
    if (!parse.success) return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
    await db.from('client_settings')
      .update({
        weather_sensitive: parse.data.weather_sensitive,
        weather_sensitivity: parse.data.weather_sensitivity ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', request.tenantId);
    return reply.send({ success: true });
  });

  app.post('/ops/news/scan-now', { preHandler: authenticate }, async (request, reply) => {
    const r = await scanNewsForTenant(request.tenantId);
    return reply.send(r);
  });

  app.post('/ops/weather/refresh-now', { preHandler: authenticate }, async (request, reply) => {
    const r = await refreshWeatherForTenant(request.tenantId);
    return reply.send(r ?? { skipped: true, reason: 'not weather_sensitive or no API key' });
  });

  // Crons
  app.post('/ops/cron/news-scan', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const r = await dispatchNewsScanCron();
    return reply.send(r);
  });

  app.post('/ops/cron/weather', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const r = await dispatchWeatherCron();
    return reply.send(r);
  });

  app.post('/ops/cron/shopify-sync', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const r = await dispatchShopifySyncCron();
    return reply.send(r);
  });

  app.post('/ops/cron/ai-landscape', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const warnings: string[] = [];
    const log = (msg: string) => { request.log.info(msg); warnings.push(msg); };
    const result = await runAiLandscapeDigest(log);
    return reply.send({ ...result, log: warnings });
  });

  app.post('/ops/cron/ghost-cleanup', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const logs: string[] = [];
    const log = (msg: string) => { request.log.info(msg); logs.push(msg); };
    const result = await runGhostCleanup(log);
    return reply.send({ ...result, log: logs });
  });

  app.post('/ops/cron/creative-discard', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const logs: string[] = [];
    const log = (msg: string) => { request.log.info(msg); logs.push(msg); };
    const result = await runCreativeDiscard(log);
    return reply.send({ ...result, log: logs });
  });

  // ── Operator incident report from client ──────────────────────────────────
  // Called by the web app when a user hits repeated failures.
  // Authenticated — so we know which tenant is struggling.
  app.post('/ops/report-incident', { preHandler: authenticate }, async (request, reply) => {
    const { type, message, path, count } = request.body as {
      type: string;
      message: string;
      path?: string;
      count?: number;
    };
    if (!type || !message) return reply.code(400).send({ error: 'type and message required' });

    const countLabel = count ? ` (×${count})` : '';
    sendOperatorAlert({
      title: `User stuck: ${type}${countLabel}`,
      body: `A user is experiencing repeated failures and needs attention.\n\nType: ${type}\nMessage: ${message}\nPath: ${path ?? 'unknown'}\nFailures: ${count ?? 1}`,
      severity: count && count >= 3 ? 'critical' : 'warning',
      tenantId: request.tenantId,
      meta: { type, path: path ?? '', count: count ?? 1 },
    });
    request.log.warn({ tenantId: request.tenantId, type, count }, 'operator incident report from client');
    return reply.send({ ok: true });
  });
}

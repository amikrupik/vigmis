// Comments Intelligence routes — Session 6 endpoints for priority, lead
// digest, crisis detection, insights, and override learning.
//
// GET  /comments/priority/refresh    → score all unscored comments for this tenant
// POST /comments/digest/send-now     → preview/send lead digest
// POST /comments/crisis/check        → evaluate this tenant for crisis
// POST /comments/insights/refresh    → mine recurring themes for this tenant
// GET  /comments/insights            → list active insights
// POST /comments/learn-overrides     → run override-learning for this tenant
//
// Crons:
// POST /comments/cron/priority       → scan all tenants
// POST /comments/cron/digest         → dispatch lead digests
// POST /comments/cron/crisis         → dispatch crisis checks
// POST /comments/cron/insights       → mine insights for all tenants

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { scorePendingComments } from '../services/comment-priority.js';
import { sendLeadDigestForTenant, dispatchLeadDigestCron } from '../services/lead-digest.js';
import { evaluateAndAlertTenant, dispatchCrisisCron } from '../services/sentiment-velocity.js';
import { mineInsightsForTenant, dispatchInsightsCron } from '../services/comment-insights.js';
import { learnFromOverridesForTenant } from '../services/reply-override-learning.js';

function cronAuth(req: any): boolean {
  const secret = (req.headers['x-cron-secret'] as string) ?? '';
  return secret === (process.env.CRON_SECRET ?? 'vigmis-cron');
}

export async function commentsIntelligenceRoutes(app: FastifyInstance) {

  // ── Per-tenant manual triggers ─────────────────────────────────────────────
  app.post('/comments/priority/refresh', { preHandler: authenticate }, async (request, reply) => {
    const result = await scorePendingComments(request.tenantId);
    return reply.send(result);
  });

  app.post('/comments/digest/send-now', { preHandler: authenticate }, async (request, reply) => {
    const result = await sendLeadDigestForTenant(request.tenantId);
    return reply.send(result);
  });

  app.post('/comments/crisis/check', { preHandler: authenticate }, async (request, reply) => {
    const result = await evaluateAndAlertTenant(request.tenantId);
    return reply.send(result);
  });

  app.post('/comments/insights/refresh', { preHandler: authenticate }, async (request, reply) => {
    const result = await mineInsightsForTenant(request.tenantId);
    return reply.send(result);
  });

  app.get('/comments/insights', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db.from('comment_insights')
      .select('id, insight_kind, theme, occurrence_count, suggested_action, status, first_seen_at, last_seen_at')
      .eq('tenant_id', request.tenantId)
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .limit(50);
    return reply.send({ insights: data ?? [] });
  });

  app.post('/comments/insights/:id/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.from('comment_insights')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', request.tenantId);
    return reply.send({ success: true });
  });

  app.post('/comments/learn-overrides', { preHandler: authenticate }, async (request, reply) => {
    const body = (request.body ?? {}) as { autoApply?: boolean; lookbackDays?: number };
    const result = await learnFromOverridesForTenant(request.tenantId, {
      autoApply: body.autoApply ?? false,
      lookbackDays: body.lookbackDays ?? 30,
    });
    return reply.send(result);
  });

  // ── Crons ─────────────────────────────────────────────────────────────────
  app.post('/comments/cron/priority', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    // Cheap: just scan all tenants with unscored comments
    const { data: tenants } = await db.from('social_comments')
      .select('tenant_id')
      .is('priority_score', null)
      .limit(1000);
    const unique = [...new Set((tenants ?? []).map((t: { tenant_id: string }) => t.tenant_id))];
    let total = 0;
    for (const t of unique) {
      const r = await scorePendingComments(t).catch(() => ({ updated: 0 }));
      total += r.updated;
    }
    return reply.send({ tenants: unique.length, scored: total });
  });

  app.post('/comments/cron/digest', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const result = await dispatchLeadDigestCron();
    return reply.send(result);
  });

  app.post('/comments/cron/crisis', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const result = await dispatchCrisisCron();
    return reply.send(result);
  });

  app.post('/comments/cron/insights', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const result = await dispatchInsightsCron();
    return reply.send(result);
  });
}

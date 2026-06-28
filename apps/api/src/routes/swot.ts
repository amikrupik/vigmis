// GET  /swot                              — list living_swot items for tenant (auto-generate if empty)
// POST /swot/generate                     — manually trigger SWOT generation
// POST /swot/refresh                      — trigger full strategy re-analysis
// GET  /swot/recommendations              — list strategy_update_recommendations (latest 10)
// POST /swot/recommendations/:id/approve  — approve a recommendation and apply new strategy
// POST /swot/recommendations/:id/dismiss  — dismiss a recommendation

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { generateAndSaveSwot } from '../services/swot-generator.js';
import { runStrategyRefresh } from '../services/strategy-refresher.js';

const SWOT_CATEGORY_ORDER: Record<string, number> = {
  strength: 0,
  weakness: 1,
  opportunity: 2,
  threat: 3,
};

export async function swotRoutes(app: FastifyInstance) {

  // ── GET /swot ─────────────────────────────────────────────────────────────────
  // Returns living_swot items for the tenant ordered by category.
  // If no items exist, auto-generates SWOT first.
  app.get('/swot', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const { data: existing, error: fetchError } = await db
      .from('living_swot')
      .select('*')
      .eq('tenant_id', tenantId);

    if (fetchError) {
      return reply.status(500).send({ error: fetchError.message });
    }

    if (!existing || existing.length === 0) {
      try {
        await generateAndSaveSwot(tenantId);
      } catch (genErr) {
        app.log.error({ err: genErr, tenantId }, 'SWOT auto-generate failed');
        return reply.send({ items: [], autoGenerateFailed: true });
      }

      const { data: generated, error: genError } = await db
        .from('living_swot')
        .select('*')
        .eq('tenant_id', tenantId);

      if (genError) {
        return reply.status(500).send({ error: genError.message });
      }

      const sorted = (generated ?? []).sort(
        (a: any, b: any) =>
          (SWOT_CATEGORY_ORDER[a.category] ?? 99) - (SWOT_CATEGORY_ORDER[b.category] ?? 99),
      );

      return reply.send({ items: sorted });
    }

    const sorted = existing.sort(
      (a: any, b: any) =>
        (SWOT_CATEGORY_ORDER[a.category] ?? 99) - (SWOT_CATEGORY_ORDER[b.category] ?? 99),
    );

    return reply.send({ items: sorted });
  });

  // ── POST /swot/generate ───────────────────────────────────────────────────────
  // Manually trigger SWOT regeneration for this tenant.
  app.post('/swot/generate', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const items = await generateAndSaveSwot(tenantId);

    return reply.send({ success: true, count: items.length });
  });

  // ── POST /swot/refresh ────────────────────────────────────────────────────────
  // Trigger full strategy re-analysis. Creates a recommendation but does NOT
  // auto-apply — user must approve from /swot/recommendations.
  app.post('/swot/refresh', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const result = await runStrategyRefresh(tenantId, 'manual');

    return reply.send({ queued: true, recommendationId: result.recommendationId });
  });

  // ── GET /swot/recommendations ─────────────────────────────────────────────────
  // List strategy_update_recommendations for the tenant, newest first, max 10.
  app.get('/swot/recommendations', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const statusFilter = (request.query as Record<string, string>).status ?? 'pending';
    const { data, error } = await db
      .from('strategy_update_recommendations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ recommendations: data ?? [] });
  });

  // ── POST /swot/recommendations/:id/approve ────────────────────────────────────
  // Approve a recommendation:
  //   1. Mark status='approved', reviewed_at=now()
  //   2. Apply strategy_changes.new_strategy to client_settings.strategy_plan
  //   3. Regenerate SWOT from the new strategy
  app.post(
    '/swot/recommendations/:id/approve',
    { preHandler: authenticate },
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params as { id: string };

      // Fetch the recommendation
      const { data: rec, error: recError } = await db
        .from('strategy_update_recommendations')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (recError) {
        return reply.status(500).send({ error: recError.message });
      }
      if (!rec) {
        return reply.status(404).send({ error: 'Recommendation not found' });
      }

      // Mark as approved
      const { error: approveError } = await db
        .from('strategy_update_recommendations')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (approveError) {
        return reply.status(500).send({ error: approveError.message });
      }

      // Apply new_strategy to client_settings
      const strategyChanges = rec.strategy_changes as any;
      const newStrategy = strategyChanges?.new_strategy ?? null;

      if (newStrategy) {
        const { error: settingsError } = await db
          .from('client_settings')
          .update({ strategy_plan: newStrategy })
          .eq('tenant_id', tenantId);

        if (settingsError) {
          return reply.status(500).send({ error: settingsError.message });
        }
      }

      // Regenerate SWOT from the updated strategy
      await generateAndSaveSwot(tenantId);

      return reply.send({ success: true });
    },
  );

  // ── POST /swot/recommendations/:id/dismiss ────────────────────────────────────
  // Dismiss a recommendation without applying changes.
  app.post(
    '/swot/recommendations/:id/dismiss',
    { preHandler: authenticate },
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params as { id: string };

      const { error } = await db
        .from('strategy_update_recommendations')
        .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ success: true });
    },
  );
}

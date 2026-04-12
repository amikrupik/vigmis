// POST /optimization/run        — trigger optimization for current tenant
// POST /optimization/run-all    — trigger for all tenants (admin/cron)
// GET  /optimization/history    — recent optimization actions for this tenant
// GET  /optimization/settings   — get optimization mode (auto/manual) + risk level
// POST /optimization/settings   — update optimization mode

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { runOptimizationForTenant, runOptimizationAll } from '../optimization/engine.js';

export async function optimizationRoutes(app: FastifyInstance) {

  // Trigger optimization for the logged-in tenant
  app.post('/optimization/run', { preHandler: authenticate }, async (request, reply) => {
    const result = await runOptimizationForTenant(request.tenantId);
    return reply.send(result);
  });

  // GET /optimization/history — last 20 optimization actions for this tenant
  app.get('/optimization/history', { preHandler: authenticate }, async (request, reply) => {
    const { data: logs } = await db
      .from('audit_log')
      .select('id, action, platform, payload, created_at')
      .eq('tenant_id', request.tenantId)
      .like('action', 'optimization.%')
      .not('action', 'eq', 'optimization.metrics_snapshot')
      .order('created_at', { ascending: false })
      .limit(20);

    const entries = (logs ?? []).map((l: any) => {
      const action = l.action.replace('optimization.', '');
      const p = l.payload as any;
      return {
        id: l.id,
        action,
        platform: l.platform,
        campaign_id: p?.campaignId ?? null,
        campaign_name: p?.campaignName ?? p?.action?.campaignId ?? null,
        reason: p?.action?.reason ?? p?.reason ?? null,
        factor: p?.action?.factor ?? null,
        created_at: l.created_at,
      };
    });

    return reply.send({ entries });
  });

  // GET /optimization/settings — optimization mode for this tenant
  app.get('/optimization/settings', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db
      .from('client_settings')
      .select('risk_level, management_percentage')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    return reply.send({
      risk_level: data?.risk_level ?? 'moderate',
      management_percentage: data?.management_percentage ?? 100,
      auto_mode: (data?.risk_level ?? 'moderate') !== 'conservative',
    });
  });

  // POST /optimization/settings — update risk level
  app.post('/optimization/settings', { preHandler: authenticate }, async (request, reply) => {
    const { risk_level, management_percentage } = request.body as any;
    if (!['conservative', 'moderate', 'aggressive'].includes(risk_level)) {
      return reply.code(400).send({ error: 'risk_level must be conservative | moderate | aggressive' });
    }

    const { error } = await db.from('client_settings').upsert(
      {
        tenant_id: request.tenantId,
        risk_level,
        management_percentage: management_percentage ?? 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );

    if (error) return reply.code(500).send({ error: 'Failed to save settings' });

    return reply.send({
      success: true,
      risk_level,
      auto_mode: risk_level !== 'conservative',
    });
  });

  // Cron endpoint — called by scheduler, not by users
  // In production: protect with a secret header
  app.post('/optimization/run-all', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const results = await runOptimizationAll();
    return reply.send({
      tenantsProcessed: results.length,
      totalActions: results.reduce((s, r) => s + r.actionsApplied, 0),
      totalErrors: results.reduce((s, r) => s + r.errors.length, 0),
    });
  });
}

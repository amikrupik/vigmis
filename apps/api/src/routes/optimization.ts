// POST /optimization/run        — trigger optimization for current tenant
// POST /optimization/run-all    — trigger for all tenants (admin/cron)

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { runOptimizationForTenant, runOptimizationAll } from '../optimization/engine.js';

export async function optimizationRoutes(app: FastifyInstance) {

  // Trigger optimization for the logged-in tenant
  app.post('/optimization/run', { preHandler: authenticate }, async (request, reply) => {
    const result = await runOptimizationForTenant(request.tenantId);
    return reply.send(result);
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

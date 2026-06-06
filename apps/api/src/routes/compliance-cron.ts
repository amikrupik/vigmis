// Compliance cron endpoints — Session 5 administrative crons.
//
// POST /compliance/cron/reattestation  → daily nudge
// POST /compliance/cron/stop-loss      → daily stop-loss evaluation
// POST /compliance/cron/recompute-trust → daily trust tier recomputation

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '@vigmis/db';
import { dispatchReAttestationCron } from '../services/re-attestation.js';
import { dispatchStopLossCron } from '../services/stop-loss.js';
import { recomputeTrustTier } from '../services/trust-tier.js';
import { hasValidCronSecret } from '../middleware/secrets.js';

function cronAuth(req: FastifyRequest): boolean {
  return hasValidCronSecret(req);
}

export async function complianceCronRoutes(app: FastifyInstance) {
  app.post('/compliance/cron/reattestation', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const result = await dispatchReAttestationCron();
    return reply.send(result);
  });

  app.post('/compliance/cron/stop-loss', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const result = await dispatchStopLossCron();
    return reply.send(result);
  });

  app.post('/compliance/cron/recompute-trust', async (request, reply) => {
    if (!cronAuth(request)) return reply.code(401).send({ error: 'Unauthorized' });
    const { data: tenants } = await db.from('tenants').select('id').eq('frozen', false);
    let updated = 0;
    for (const t of tenants ?? []) {
      await recomputeTrustTier(t.id).catch(() => null);
      updated++;
    }
    return reply.send({ updated });
  });
}

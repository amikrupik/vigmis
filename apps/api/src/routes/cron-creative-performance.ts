import type { FastifyInstance } from 'fastify';
import { hasValidCronSecret } from '../middleware/secrets.js';
import { syncCreativePerformance } from '../services/creative-performance.js';

export async function creativePerformanceCronRoutes(app: FastifyInstance) {
  app.post('/cron/creative-performance-sync', async (request, reply) => {
    if (!hasValidCronSecret(request)) return reply.code(401).send({ error: 'unauthorized' });
    const result = await syncCreativePerformance();
    return reply.send(result);
  });
}

import type { FastifyInstance } from 'fastify';
import { hasValidCronSecret } from '../middleware/secrets.js';
import { aggregateBenchmarks } from '../services/benchmark-aggregator.js';

export async function benchmarkCronRoutes(app: FastifyInstance) {
  app.post('/cron/benchmark-aggregate', async (request, reply) => {
    if (!hasValidCronSecret(request)) return reply.code(401).send({ error: 'unauthorized' });
    const result = await aggregateBenchmarks();
    return reply.send(result);
  });
}

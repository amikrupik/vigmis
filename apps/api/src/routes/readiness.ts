// Conversion Readiness routes — "should we even be running ads to your page?"
//
// POST /readiness/audit    → run a fresh audit on the tenant's website
// GET  /readiness          → return the latest cached audit
// GET  /readiness/gate     → can we start paid campaigns right now?

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { auditConversionReadiness, gateAdsByReadiness } from '../services/conversion-readiness.js';

export async function readinessRoutes(app: FastifyInstance) {
  app.post('/readiness/audit', { preHandler: authenticate }, async (request, reply) => {
    const { data: settings } = await db.from('client_settings')
      .select('website_url, goal, geo_include')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    if (!settings?.website_url) {
      return reply.code(400).send({ error: 'no_website_url', message: 'Set a website URL in onboarding before auditing.' });
    }

    const targetMarket = Array.isArray(settings.geo_include) && settings.geo_include.length > 0
      ? extractCountryCode(settings.geo_include[0])
      : undefined;

    const report = await auditConversionReadiness({
      tenantId: request.tenantId,
      websiteUrl: settings.website_url,
      goal: settings.goal,
      targetMarket,
    });
    return reply.send({ report });
  });

  app.get('/readiness', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db.from('client_settings')
      .select('conversion_readiness, conversion_readiness_score, conversion_readiness_at')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    if (!data?.conversion_readiness) {
      return reply.code(404).send({ error: 'no_audit', message: 'No conversion-readiness audit yet. Run POST /readiness/audit.' });
    }
    return reply.send({
      report: data.conversion_readiness,
      score: data.conversion_readiness_score,
      evaluated_at: data.conversion_readiness_at,
    });
  });

  app.get('/readiness/gate', { preHandler: authenticate }, async (request, reply) => {
    const gate = await gateAdsByReadiness(request.tenantId);
    return reply.send(gate);
  });
}

// Best-effort: extract an ISO country code from a geo label like "Israel" or "Tel Aviv".
function extractCountryCode(geo: string): string | undefined {
  const map: Record<string, string> = {
    israel: 'IL', 'tel aviv': 'IL', jerusalem: 'IL', haifa: 'IL',
    usa: 'US', 'united states': 'US', america: 'US',
    uk: 'GB', 'united kingdom': 'GB', england: 'GB',
    germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
  };
  const norm = geo.toLowerCase().trim();
  return map[norm];
}

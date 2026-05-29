// Briefings routes
//
// GET  /briefings/preferences        → current prefs for tenant
// PUT  /briefings/preferences        → update prefs
// POST /briefings/send-now           → send a briefing right now (preview/test)
// GET  /briefings/log                → past briefings sent to this tenant
// POST /briefings/cron               → cron entrypoint (uses CRON_SECRET)

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import {
  buildBriefing,
  sendBriefingForTenant,
  dispatchBriefingsCron,
} from '../services/briefings.js';

const PrefsBody = z.object({
  enabled: z.boolean().optional(),
  cadence: z.enum(['daily', 'weekly', 'never']).optional(),
  channels: z.array(z.enum(['email', 'whatsapp'])).optional(),
  weekly_day_of_week: z.number().int().min(0).max(6).optional(),
  delivery_hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().optional(),
  language: z.enum(['en', 'he', 'ar', 'ru']).optional(),
  min_significant_changes: z.number().int().min(0).max(100).optional(),
});

export async function briefingRoutes(app: FastifyInstance) {
  app.get('/briefings/preferences', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db.from('briefing_preferences')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    return reply.send({ preferences: data ?? null });
  });

  app.put('/briefings/preferences', { preHandler: authenticate }, async (request, reply) => {
    const parse = PrefsBody.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
    }
    const { error } = await db.from('briefing_preferences').upsert(
      {
        tenant_id: request.tenantId,
        ...parse.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );
    if (error) {
      return reply.code(500).send({ error: 'persist_failed' });
    }
    return reply.send({ success: true });
  });

  app.post('/briefings/send-now', { preHandler: authenticate }, async (request, reply) => {
    const result = await sendBriefingForTenant(request.tenantId);
    return reply.send(result);
  });

  app.get('/briefings/log', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db.from('briefing_log')
      .select('id, cadence, channels_sent, summary_working, summary_decision, summary_automated, sent_at, opened_at')
      .eq('tenant_id', request.tenantId)
      .order('sent_at', { ascending: false })
      .limit(20);
    return reply.send({ briefings: data ?? [] });
  });

  app.get('/briefings/preview', { preHandler: authenticate }, async (request, reply) => {
    const cadence = ((request.query as Record<string, string>).cadence ?? 'weekly') as 'daily' | 'weekly';
    const sections = await buildBriefing(request.tenantId, cadence);
    return reply.send({ sections });
  });

  // Cron — runs hourly. Each tenant has a preferred delivery hour; the cron
  // only fires for tenants whose hour matches.
  app.post('/briefings/cron', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const result = await dispatchBriefingsCron();
    return reply.send(result);
  });
}

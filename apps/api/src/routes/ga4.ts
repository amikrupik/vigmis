// GA4 (Google Analytics 4) routes
//
// GET  /ga4/properties        — list GA4 properties this user can access
// GET  /ga4/settings          — current selection for this tenant
// POST /ga4/settings          — pick a property
// POST /ga4/sync              — manual one-tenant sync (mostly for debugging)
// POST /ga4/cron/sync         — cron-protected: sync all enabled tenants

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { listGa4Properties, fetchGa4DailyAcquisition } from '@vigmis/ad-connectors';

export async function ga4Routes(app: FastifyInstance) {
  app.get('/ga4/properties', { preHandler: authenticate }, async (request, reply) => {
    try {
      const properties = await listGa4Properties(request.tenantId);
      return reply.send({ properties });
    } catch (err) {
      request.log.error({ err }, 'GA4 properties list failed');
      return reply.code(500).send({ error: 'Failed to list GA4 properties — make sure Google is connected and the analytics.readonly scope was granted.' });
    }
  });

  app.get('/ga4/settings', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db
      .from('ga4_settings')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    return reply.send({ settings: data ?? null });
  });

  app.post<{ Body: { property_id: string; property_name?: string; default_currency?: string } }>(
    '/ga4/settings',
    { preHandler: authenticate },
    async (request, reply) => {
      const { property_id, property_name, default_currency } = request.body ?? ({} as any);
      if (!property_id || !/^properties\/\d+$/.test(property_id)) {
        return reply.code(400).send({ error: 'property_id must look like "properties/123456789"' });
      }
      const { error } = await db.from('ga4_settings').upsert({
        tenant_id: request.tenantId,
        property_id,
        property_name: property_name ?? null,
        default_currency: default_currency ?? null,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
      if (error) {
        request.log.error({ error }, 'Failed to save GA4 settings');
        return reply.code(500).send({ error: 'Failed to save GA4 settings' });
      }
      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'ga4.property_selected',
        actor: 'user',
        payload: { property_id },
      });
      return reply.send({ success: true });
    },
  );

  app.post('/ga4/sync', { preHandler: authenticate }, async (request, reply) => {
    const result = await syncTenantGa4(request.tenantId);
    return reply.send(result);
  });

  // Cron-only: sync all tenants that have GA4 configured.
  app.post('/ga4/cron/sync', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const { data: tenants } = await db
      .from('ga4_settings')
      .select('tenant_id')
      .eq('enabled', true);
    let processed = 0, rows = 0, errors = 0;
    for (const t of tenants ?? []) {
      try {
        const r = await syncTenantGa4(t.tenant_id);
        processed++; rows += r.rows ?? 0;
      } catch { errors++; }
    }
    return reply.send({ processed, rows, errors });
  });
}

export async function syncTenantGa4(tenantId: string): Promise<{ rows: number; from?: string; to?: string }> {
  const { data: settings } = await db
    .from('ga4_settings')
    .select('property_id, last_synced_at')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .maybeSingle();

  if (!settings?.property_id) return { rows: 0 };

  // First sync pulls 30 days, subsequent syncs pull 2 days to catch late conversions.
  const daysBack = settings.last_synced_at ? 2 : 30;

  const data = await fetchGa4DailyAcquisition(tenantId, settings.property_id, daysBack);
  if (!data.length) {
    await db.from('ga4_settings').update({ last_synced_at: new Date().toISOString() }).eq('tenant_id', tenantId);
    return { rows: 0 };
  }

  const records = data.map(r => ({ tenant_id: tenantId, ...r }));

  // Upsert in chunks of 500 to stay under PostgREST limits
  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    await db
      .from('ga4_daily_metrics')
      .upsert(records.slice(i, i + chunkSize), {
        onConflict: 'tenant_id,date,source,medium,session_campaign',
      });
  }

  await db.from('ga4_settings').update({ last_synced_at: new Date().toISOString() }).eq('tenant_id', tenantId);
  return { rows: records.length, from: data[0]?.date, to: data[data.length - 1]?.date };
}

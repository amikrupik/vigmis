// GET /history/timeline   — last 12 monthly snapshots + geo snapshots + audit highlights
// POST /history/snapshot  — create/update monthly snapshot for this tenant (called by monthly cron)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

export async function historyRoutes(app: FastifyInstance) {

  // ── Timeline ─────────────────────────────────────────────────────────────────
  app.get('/history/timeline', { preHandler: authenticate }, async (request, reply) => {
    const [monthlyRes, geoRes, auditRes] = await Promise.all([
      db.from('monthly_snapshots')
        .select('*')
        .eq('tenant_id', request.tenantId)
        .order('snapshot_month', { ascending: false })
        .limit(12),
      db.from('geo_report_snapshots')
        .select('snapshot_month, score, grade, score_delta, issues_critical, issues_warning, website_url, created_at')
        .eq('tenant_id', request.tenantId)
        .order('snapshot_month', { ascending: false })
        .limit(12),
      db.from('audit_log')
        .select('action, actor, payload, created_at')
        .eq('tenant_id', request.tenantId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const monthly   = monthlyRes.data ?? [];
    const geo       = geoRes.data ?? [];
    const auditLog  = auditRes.data ?? [];

    // Merge into unified month buckets
    const buckets: Record<string, any> = {};

    for (const m of monthly) {
      buckets[m.snapshot_month] = { ...m, geo: null, highlights: [] };
    }
    for (const g of geo) {
      if (!buckets[g.snapshot_month]) buckets[g.snapshot_month] = { snapshot_month: g.snapshot_month, highlights: [] };
      buckets[g.snapshot_month].geo = g;
    }
    for (const log of auditLog) {
      const month = log.created_at.slice(0, 7);
      if (!buckets[month]) buckets[month] = { snapshot_month: month, highlights: [] };
      buckets[month].highlights = buckets[month].highlights ?? [];
      buckets[month].highlights.push({ action: log.action, actor: log.actor, created_at: log.created_at });
    }

    const timeline = Object.values(buckets)
      .sort((a: any, b: any) => b.snapshot_month.localeCompare(a.snapshot_month))
      .slice(0, 12);

    return reply.send({ timeline });
  });

  // ── Create/update monthly snapshot (called by monthly cron) ──────────────────
  app.post('/history/snapshot', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const now = new Date();
    const snapshotMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString().slice(0, 7); // previous month

    const { data: tenants } = await db
      .from('client_settings')
      .select('tenant_id')
      .not('confirmed_at', 'is', null);

    if (!tenants?.length) return reply.send({ processed: 0 });

    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    let processed = 0;
    for (const t of tenants) {
      try {
        const [campaignsRes, auditRes, socialRes, geoRes] = await Promise.all([
          db.from('campaigns').select('id, status, daily_budget_usd').eq('tenant_id', t.tenant_id),
          db.from('audit_log').select('action').eq('tenant_id', t.tenant_id)
            .gte('created_at', monthStart).lte('created_at', monthEnd),
          db.from('social_posts').select('id', { count: 'exact', head: true })
            .eq('tenant_id', t.tenant_id).eq('status', 'published')
            .gte('published_at', monthStart),
          db.from('geo_report_snapshots').select('score, grade, score_delta')
            .eq('tenant_id', t.tenant_id).eq('snapshot_month', snapshotMonth)
            .maybeSingle(),
        ]);

        const campaigns = campaignsRes.data ?? [];
        const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
        const totalDailyBudget = campaigns.filter(c => c.status === 'active')
          .reduce((s: number, c: any) => s + (c.daily_budget_usd ?? 0), 0);

        const logs = auditRes.data ?? [];
        const optimizationsCount = logs.filter((l: any) => l.action?.startsWith('optimization.')).length;
        const budgetChangesCount = logs.filter((l: any) => l.action?.startsWith('budget.')).length;

        await db.from('monthly_snapshots').upsert(
          {
            tenant_id: t.tenant_id,
            snapshot_month: snapshotMonth,
            geo_score: geoRes.data?.score ?? null,
            geo_grade: geoRes.data?.grade ?? null,
            geo_score_delta: geoRes.data?.score_delta ?? null,
            active_campaigns: activeCampaigns,
            total_daily_budget_usd: parseFloat(totalDailyBudget.toFixed(2)),
            optimizations_count: optimizationsCount,
            budget_changes_count: budgetChangesCount,
            social_posts_published: socialRes.count ?? 0,
          },
          { onConflict: 'tenant_id,snapshot_month' },
        );

        processed++;
      } catch { /* continue */ }
    }

    return reply.send({ processed, total: tenants.length, month: snapshotMonth });
  });
}

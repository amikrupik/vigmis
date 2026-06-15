// Data Maturity Score — governs which intelligence engines activate per tenant.
//
// The core principle: never act with more sophistication than your data supports.
// Budget alone means nothing — a $5K awareness campaign has no conversion data.
// What matters is data density: clicks, days running, connected integrations.
//
// Levels:
//   1 — <14 days or <30 clicks: quality gate only, never touch budgets
//   2 — 14-30 days, 30-100 clicks: CTR optimization only
//   3 — >30 days, >100 clicks, GA4 connected: full optimization + A/B
//   4 — >90 days, >500 clicks, 2+ platforms: + Portfolio Allocator + Incrementality
//   5 — >180 days, >2000 clicks, Shopify connected: + Product Intelligence + Cohort
//
// Runs weekly. All other engines check level before acting.

import { db } from '@vigmis/db';

export interface DataMaturityResult {
  level: 1 | 2 | 3 | 4 | 5;
  daysRunning: number;
  totalClicks: number;
  platformCount: number;
  ga4Connected: boolean;
  shopifyConnected: boolean;
  reasons: string[];
}

export async function computeDataMaturity(tenantId: string): Promise<DataMaturityResult> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [campaignsRes, auditRes, ga4Res, settingsRes] = await Promise.all([
    db.from('campaigns')
      .select('id, platform, created_at, status')
      .eq('tenant_id', tenantId),
    db.from('audit_log')
      .select('payload')
      .eq('tenant_id', tenantId)
      .eq('action', 'optimization.metrics_snapshot')
      .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()),
    db.from('ga4_daily_metrics')
      .select('date, sessions')
      .eq('tenant_id', tenantId)
      .gte('date', since30)
      .limit(1),
    db.from('client_settings')
      .select('website_url')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const snapshots = auditRes.data ?? [];

  // Days since first campaign
  const firstCampaign = campaigns.reduce((earliest: Date | null, c: any) => {
    const d = new Date(c.created_at);
    return !earliest || d < earliest ? d : earliest;
  }, null);
  const daysRunning = firstCampaign
    ? Math.floor((Date.now() - firstCampaign.getTime()) / 86_400_000)
    : 0;

  // Total clicks from audit snapshots
  const totalClicks = snapshots.reduce((sum: number, s: any) => {
    return sum + ((s.payload as any)?.clicks ?? 0);
  }, 0);

  // Distinct platforms
  const platforms = new Set(campaigns.map((c: any) => c.platform as string));
  const platformCount = platforms.size;

  // GA4 connected = has at least one row in last 30 days
  const ga4Connected = (ga4Res.data?.length ?? 0) > 0;

  // Shopify = heuristic: check if shopify_sync in audit
  const { data: shopifyAudit } = await db.from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'shopify.sync_completed')
    .limit(1);
  const shopifyConnected = (shopifyAudit?.length ?? 0) > 0;

  const reasons: string[] = [];
  let level: 1 | 2 | 3 | 4 | 5 = 1;

  if (daysRunning < 14 || totalClicks < 30) {
    level = 1;
    reasons.push(`${daysRunning} days running, ${totalClicks} clicks — too early to optimize`);
  } else if (daysRunning < 30 || totalClicks < 100) {
    level = 2;
    reasons.push(`${daysRunning} days, ${totalClicks} clicks — CTR signals only`);
  } else if (!ga4Connected || daysRunning < 90 || totalClicks < 500) {
    level = 3;
    if (!ga4Connected) reasons.push('GA4 not connected — cross-validation unavailable');
    else reasons.push(`${daysRunning} days, ${totalClicks} clicks, GA4 connected — full optimization active`);
  } else if (platformCount < 2 || daysRunning < 180 || totalClicks < 2000) {
    level = 4;
    reasons.push(`${daysRunning} days, ${totalClicks} clicks, ${platformCount} platform(s) — portfolio intelligence active`);
    if (platformCount < 2) reasons.push('single platform — portfolio allocator monitoring for expansion opportunity');
  } else {
    level = 5;
    reasons.push(`${daysRunning} days, ${totalClicks} clicks, ${platformCount} platforms — full intelligence stack active`);
    if (!shopifyConnected) reasons.push('Shopify not connected — product-level intelligence unavailable');
  }

  return { level, daysRunning, totalClicks, platformCount, ga4Connected, shopifyConnected, reasons };
}

export async function updateDataMaturityForAll(): Promise<void> {
  if (process.env.ENABLE_DATA_MATURITY === 'false') return;

  const { data: tenants } = await db
    .from('client_settings')
    .select('tenant_id');

  if (!tenants?.length) return;

  let updated = 0;
  for (const { tenant_id } of tenants) {
    try {
      const result = await computeDataMaturity(tenant_id);
      await db.from('client_settings')
        .update({
          data_maturity_level: result.level,
          data_maturity_computed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id);
      updated++;
    } catch (err) {
      console.error(`[data-maturity] tenant=${tenant_id} error:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[data-maturity] updated ${updated}/${tenants.length} tenants`);
}

export async function getDataMaturityLevel(tenantId: string): Promise<number> {
  const { data } = await db
    .from('client_settings')
    .select('data_maturity_level')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as any)?.data_maturity_level ?? 1;
}

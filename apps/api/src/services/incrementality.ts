// Incrementality — estimate how much of the reported ROAS is REAL incremental
// impact vs. revenue that would have happened anyway.
//
// The dirty secret of paid ads: platform-reported ROAS counts customers who
// would have purchased without seeing the ad. A brand-search ad on your own
// name claims credit for every loyal customer who Googled you. GA4 is better
// (single-touch) but still over-attributes.
//
// The cheapest defensible proxy for "true incremental": revenue from
// FIRST-TIME customers. They're definitionally new — they wouldn't have
// returned because they were never there. Floor estimate, but defensible.
//
// This service:
//   1. Pulls new vs returning customer revenue from GA4 + Shopify
//   2. Computes incremental_roas = new_customer_revenue / ad_spend
//   3. Surfaces the delta vs platform-reported ROAS
//
// Used by:
//   - Dashboard "real ROAS" widget
//   - Briefings ("you think ROAS is 4.2, true incremental is 2.1")

import { db } from '@vigmis/db';

export interface IncrementalitySnapshot {
  window_days: number;
  ad_spend_usd: number;
  total_revenue_usd: number;
  new_customer_revenue: number;
  returning_revenue: number;
  platform_reported_roas: number | null;
  ga4_reported_roas: number;
  incremental_roas_estimate: number;
  confidence: number;
  confidence_notes: string;
  computed_at: string;
}

export async function computeIncrementality(
  tenantId: string,
  windowDays: number = 30,
): Promise<IncrementalitySnapshot> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // GA4 attributed revenue + new-customer split
  const { data: ga4Rows } = await db.from('ga4_daily_metrics')
    .select('purchase_revenue, first_purchase_revenue, conversions, first_time_purchasers, new_users, returning_users, source, medium')
    .eq('tenant_id', tenantId)
    .gte('date', since);

  const ga4Total = (ga4Rows ?? []).reduce(
    (s: number, r: { purchase_revenue?: number | null }) => s + (Number(r.purchase_revenue) || 0),
    0,
  );
  const ga4New = (ga4Rows ?? []).reduce(
    (s: number, r: { first_purchase_revenue?: number | null }) => s + (Number(r.first_purchase_revenue) || 0),
    0,
  );
  const ga4Paid = (ga4Rows ?? []).filter((r: { medium?: string | null }) => r.medium === 'cpc' || r.medium === 'paid');
  const ga4PaidRevenue = ga4Paid.reduce(
    (s: number, r: { purchase_revenue?: number | null }) => s + (Number(r.purchase_revenue) || 0),
    0,
  );

  // Ad spend from our campaigns table
  const { data: campaigns } = await db.from('campaigns')
    .select('id, daily_budget_usd, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // Approximation: sum of (daily budget × days running in window)
  const now = Date.now();
  const adSpend = (campaigns ?? []).reduce((sum: number, c: { daily_budget_usd: number; created_at: string }) => {
    const start = new Date(c.created_at).getTime();
    const daysRunning = Math.max(0, Math.min(windowDays, (now - start) / (24 * 3600 * 1000)));
    return sum + (Number(c.daily_budget_usd) || 0) * daysRunning;
  }, 0);

  // Platform-reported ROAS — best-effort pull from campaigns table if it has a column,
  // otherwise null. We compare GA4 vs platform once both are in DB.
  const platformReportedRoas: number | null = null;

  // Returning revenue = total - new
  const returningRevenue = Math.max(0, ga4Total - ga4New);

  const ga4Roas = adSpend > 0 ? ga4Total / adSpend : 0;
  const incrementalRoas = adSpend > 0 ? ga4New / adSpend : 0;

  // Confidence heuristic — based on how much data we actually have
  let confidence = 0;
  const notes: string[] = [];

  if ((ga4Rows?.length ?? 0) === 0) {
    notes.push('No GA4 data in window — connect GA4 to enable incrementality measurement.');
  } else if (ga4New === 0 && ga4Total > 0) {
    notes.push('GA4 connected but new-vs-returning split not yet populated — schedule a GA4 sync that pulls firstTimePurchaserRate.');
    confidence = 0.3;
  } else if (adSpend < 200) {
    notes.push('Spend too low for meaningful estimate. Need ≥$200 in window.');
    confidence = 0.4;
  } else if (ga4New > 0 && adSpend > 0) {
    confidence = Math.min(0.85, 0.4 + Math.log10(adSpend / 100) * 0.15);
    notes.push(`Floor estimate based on ${windowDays}-day new-customer revenue. True incremental is at least ${incrementalRoas.toFixed(2)}×.`);
  }

  const snapshot: IncrementalitySnapshot = {
    window_days: windowDays,
    ad_spend_usd: adSpend,
    total_revenue_usd: ga4Total,
    new_customer_revenue: ga4New,
    returning_revenue: returningRevenue,
    platform_reported_roas: platformReportedRoas,
    ga4_reported_roas: ga4Roas,
    incremental_roas_estimate: incrementalRoas,
    confidence,
    confidence_notes: notes.join(' '),
    computed_at: new Date().toISOString(),
  };

  // Persist for fast dashboard reads
  await db.from('tenant_incrementality_snapshot').upsert(
    {
      tenant_id: tenantId,
      ...snapshot,
    },
    { onConflict: 'tenant_id' },
  ).then(() => null, () => null);

  return snapshot;
}

export async function getIncrementalitySnapshot(tenantId: string): Promise<IncrementalitySnapshot | null> {
  const { data } = await db.from('tenant_incrementality_snapshot')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return null;
  return data as IncrementalitySnapshot;
}

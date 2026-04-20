// Fee calculator — computes what VIGMIS charges for a billing period

import { db } from '@vigmis/db';

export interface BillingPeriod {
  start: Date;
  end: Date;
}

export interface FeeCalculation {
  managedSpendUsd: number;
  feePercentage: number;      // 7 or 5
  percentageFeeUsd: number;
  subscriptionUsd: number;    // 0 (free) or 15 (pro)
  socialServicesUsd: number;  // social posts + comment replies billed this period
  totalUsd: number;
  plan: 'free' | 'pro';
}

export function currentMonth(): BillingPeriod {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

// Estimate managed spend from campaigns in DB
// (Real spend should come from platform APIs — this is the fallback estimate)
export async function estimateManagedSpend(
  tenantId: string,
  period: BillingPeriod,
): Promise<number> {
  const { data: campaigns } = await db
    .from('campaigns')
    .select('daily_budget_usd, status, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'paused']);

  if (!campaigns?.length) return 0;

  let totalSpend = 0;

  for (const campaign of campaigns) {
    const campaignStart = new Date(Math.max(
      new Date(campaign.created_at).getTime(),
      period.start.getTime(),
    ));
    const campaignEnd = new Date(Math.min(
      Date.now(),
      period.end.getTime(),
    ));

    if (campaignStart >= campaignEnd) continue;

    const daysActive = Math.max(0,
      (campaignEnd.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Active campaigns: full daily budget. Paused: 50% estimate.
    const factor = campaign.status === 'active' ? 1.0 : 0.5;
    totalSpend += campaign.daily_budget_usd * daysActive * factor;
  }

  return Math.round(totalSpend * 100) / 100;
}

export async function calculateFee(
  tenantId: string,
  period: BillingPeriod,
): Promise<FeeCalculation> {
  // Get plan
  const { data: billing } = await db
    .from('billing_customers')
    .select('plan')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const plan = (billing?.plan ?? 'free') as 'free' | 'pro';
  const managedSpendUsd = await estimateManagedSpend(tenantId, period);

  const feePercentage = plan === 'pro' ? 5 : 7;
  const percentageFeeUsd = Math.round(managedSpendUsd * feePercentage) / 100;
  const subscriptionUsd = plan === 'pro' ? 15 : 0;

  // Social services: per-post and per-reply charges billed this period
  const [postsRes, commentsRes] = await Promise.all([
    db.from('social_posts')
      .select('cost_usd')
      .eq('tenant_id', tenantId)
      .eq('billed', true)
      .gte('published_at', period.start.toISOString())
      .lte('published_at', period.end.toISOString()),
    db.from('social_comments')
      .select('cost_usd')
      .eq('tenant_id', tenantId)
      .eq('billed', true)
      .gte('replied_at', period.start.toISOString())
      .lte('replied_at', period.end.toISOString()),
  ]);

  const socialServicesUsd = Math.round(
    ((postsRes.data ?? []).reduce((s, p) => s + (p.cost_usd ?? 0), 0) +
      (commentsRes.data ?? []).reduce((s, c) => s + (c.cost_usd ?? 0), 0)) * 100
  ) / 100;

  const totalUsd = Math.round((percentageFeeUsd + subscriptionUsd + socialServicesUsd) * 100) / 100;

  return {
    managedSpendUsd,
    feePercentage,
    percentageFeeUsd,
    subscriptionUsd,
    socialServicesUsd,
    totalUsd,
    plan,
  };
}

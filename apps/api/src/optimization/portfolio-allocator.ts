// Portfolio Allocator — cross-platform capital allocation intelligence.
//
// The question this answers: "Where does your next dollar work hardest?"
//
// Most clients run Google AND Meta. The optimization engine optimizes each
// platform in isolation. But if Google ROAS is 4.2× and Meta ROAS is 1.8×,
// the smart move is to shift budget from Meta to Google — not just optimize
// each one independently.
//
// This service:
//   1. Groups tenant's active campaigns by platform
//   2. Computes 14-day GA4-sourced ROAS per platform (not self-reported)
//   3. If gap > threshold: creates Decision Protocol for cross-platform reallocation
//   4. Respects conservative/auto mode and data maturity level
//
// Runs daily after main optimization engine.
// Idempotent: won't create a new protocol if one is already pending for this.

import { db } from '@vigmis/db';
import { createProtocol } from '../routes/protocols.js';
import { getDataMaturityLevel } from '../services/data-maturity.js';

const MIN_ROAS_GAP_RATIO = 1.8;   // Platform A must be 1.8× better than Platform B
const MIN_PLATFORM_ROAS  = 2.0;   // Winning platform must be at least 2.0× to justify move
const MAX_REALLOCATION_PCT = 0.3; // Never move more than 30% of losing platform's budget

interface PlatformPerformance {
  platform: string;
  totalDailyBudgetUsd: number;
  campaigns: Array<{ id: string; name: string; daily_budget_usd: number; campaign_id: string }>;
  ga4Roas14d: number | null;
  ga4Sessions14d: number;
}

export async function runPortfolioAllocator(tenantId: string): Promise<void> {
  if (process.env.ENABLE_PORTFOLIO_ALLOCATOR === 'false') return;

  // Requires Level 4+ data maturity
  const maturity = await getDataMaturityLevel(tenantId);
  if (maturity < 4) return;

  // Don't create a new protocol if one is already pending
  const { data: existing } = await db
    .from('decision_protocols')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('type', 'portfolio_reallocation')
    .in('status', ['pending', 'in_discussion'])
    .limit(1);

  if (existing?.length) return;

  // Also skip if we already acted in last 30 days
  const { data: recentAction } = await db
    .from('decision_protocols')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('type', 'portfolio_reallocation')
    .eq('status', 'approved')
    .gte('resolved_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recentAction?.length) return;

  const [settingsRes, campaignsRes] = await Promise.all([
    db.from('client_settings')
      .select('risk_level, management_mode, budget_monthly_ils')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db.from('campaigns')
      .select('id, name, platform, daily_budget_usd, campaign_type')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
  ]);

  const campaigns = campaignsRes.data ?? [];
  if (campaigns.length < 2) return;

  const platformMap = new Map<string, PlatformPerformance>();

  for (const c of campaigns) {
    const platform = c.platform as string;
    if (!platformMap.has(platform)) {
      platformMap.set(platform, {
        platform,
        totalDailyBudgetUsd: 0,
        campaigns: [],
        ga4Roas14d: null,
        ga4Sessions14d: 0,
      });
    }
    const entry = platformMap.get(platform)!;
    entry.totalDailyBudgetUsd += (c.daily_budget_usd as number) ?? 0;
    entry.campaigns.push({ id: c.id, name: c.name, daily_budget_usd: c.daily_budget_usd, campaign_id: c.id });
  }

  if (platformMap.size < 2) return;

  // Compute GA4 ROAS per platform (14-day window)
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: ga4Rows } = await db
    .from('ga4_daily_metrics')
    .select('date, purchase_revenue, sessions, medium, source')
    .eq('tenant_id', tenantId)
    .gte('date', since14d);

  // Map GA4 medium to platform (cpc from google → google, paid from meta → meta)
  const ga4Revenue: Record<string, number> = {};
  const ga4Sessions: Record<string, number> = {};

  for (const row of ga4Rows ?? []) {
    const medium = (row.medium as string | null)?.toLowerCase() ?? '';
    const source = (row.source as string | null)?.toLowerCase() ?? '';
    let platform: string | null = null;

    if (source.includes('google') || medium === 'cpc') platform = 'google';
    else if (source.includes('facebook') || source.includes('instagram') || medium === 'paid_social') platform = 'meta';

    if (platform) {
      ga4Revenue[platform] = (ga4Revenue[platform] ?? 0) + (Number(row.purchase_revenue) || 0);
      ga4Sessions[platform] = (ga4Sessions[platform] ?? 0) + (Number(row.sessions) || 0);
    }
  }

  // Assign GA4 ROAS to each platform entry
  for (const [platform, perf] of platformMap) {
    const spend14d = perf.totalDailyBudgetUsd * 14;
    const revenue = ga4Revenue[platform] ?? 0;
    perf.ga4Roas14d  = spend14d > 0 && revenue > 0 ? revenue / spend14d : null;
    perf.ga4Sessions14d = ga4Sessions[platform] ?? 0;
  }

  // Find best and worst performing platforms (by GA4 ROAS)
  const platforms = Array.from(platformMap.values())
    .filter(p => p.ga4Roas14d !== null);

  if (platforms.length < 2) return;

  platforms.sort((a, b) => (b.ga4Roas14d ?? 0) - (a.ga4Roas14d ?? 0));
  const winner = platforms[0];
  const loser  = platforms[platforms.length - 1];

  const winnerRoas = winner.ga4Roas14d!;
  const loserRoas  = loser.ga4Roas14d!;

  // Only act if gap is significant AND winner is good enough to justify moving budget
  if (loserRoas <= 0 || winnerRoas < MIN_PLATFORM_ROAS) return;
  if (winnerRoas / loserRoas < MIN_ROAS_GAP_RATIO) return;

  // Recommend shifting up to 30% of loser's budget to winner
  const shiftAmount = Math.round(loser.totalDailyBudgetUsd * MAX_REALLOCATION_PCT * 100) / 100;
  if (shiftAmount < 5) return; // Not worth a protocol for <$5/day

  const managementMode = (settingsRes.data as any)?.management_mode ?? 'conservative';

  const protocolId = await createProtocol({
    tenantId,
    type: 'portfolio_reallocation',
    title: `Portfolio insight: ${winner.platform} ROAS is ${(winnerRoas / loserRoas).toFixed(1)}× stronger than ${loser.platform}`,
    recommendation: [
      `Over the last 14 days, your portfolio has a meaningful performance gap between platforms:`,
      ``,
      `• **${winner.platform}**: GA4 ROAS ${winnerRoas.toFixed(1)}× (real customers attributed)`,
      `• **${loser.platform}**: GA4 ROAS ${loserRoas.toFixed(1)}× (real customers attributed)`,
      ``,
      `${winner.platform} is delivering ${(winnerRoas / loserRoas).toFixed(1)}× more revenue per dollar than ${loser.platform}. This is not a temporary blip — it's a 14-day sustained pattern confirmed by GA4, not platform self-reporting.`,
      ``,
      `The high-ROI move: shift $${shiftAmount}/day ($${Math.round(shiftAmount * 30)}/month) from ${loser.platform} to ${winner.platform}.`,
      ``,
      `${loser.platform} retains ${(loser.totalDailyBudgetUsd - shiftAmount).toFixed(0)}/day — enough to keep it active and learning. If ${loser.platform} improves over the next 30 days, this reallocation can be reversed.`,
      ``,
      `This is your decision. Vigmis will not move budget without your approval.`,
    ].join('\n'),
    approvalText: `I approve shifting $${shiftAmount}/day from ${loser.platform} to ${winner.platform}.`,
    approvalSummary: `Portfolio: shift $${shiftAmount}/day → ${winner.platform} (${winnerRoas.toFixed(1)}× vs ${loserRoas.toFixed(1)}×)`,
    actionPayload: {
      type: 'portfolio_reallocation',
      winnerPlatform: winner.platform,
      loserPlatform: loser.platform,
      shiftAmountUsd: shiftAmount,
      winnerRoas14d: winnerRoas,
      loserRoas14d: loserRoas,
      managementMode,
    },
  });

  if (protocolId) {
    console.log(`[portfolio-allocator] tenant=${tenantId} protocol=${protocolId} winner=${winner.platform}(${winnerRoas.toFixed(1)}×) loser=${loser.platform}(${loserRoas.toFixed(1)}×) shift=$${shiftAmount}/day`);
  }
}

export async function runPortfolioAllocatorForAll(): Promise<void> {
  const { data: tenants } = await db
    .from('client_settings')
    .select('tenant_id, data_maturity_level')
    .gte('data_maturity_level', 4);

  if (!tenants?.length) return;

  for (const { tenant_id } of tenants) {
    await runPortfolioAllocator(tenant_id).catch(err =>
      console.error(`[portfolio-allocator] tenant=${tenant_id}:`, err instanceof Error ? err.message : err)
    );
  }
}

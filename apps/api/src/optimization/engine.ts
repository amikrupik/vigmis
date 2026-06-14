// Optimization Engine — runs periodically to improve all campaigns
// Called by: POST /optimization/run (or a cron job)
//
// Flow:
// 1. Load all active campaigns for all tenants
// 2. Fetch metrics from platform APIs (or use stored metrics)
// 3. Evaluate each campaign using rules engine
// 4. Conservative mode: create Decision Protocols for client approval
//    Auto mode: apply immediately + log
// 5. Log everything to audit_log + decision_protocols

import { db } from '@vigmis/db';
import { evaluateCampaign, getBenchmarkForStagnation, type CustomBenchmarkOverride } from './rules.js';
import { hasActiveAbTest, evaluateAbTests } from './ab-engine.js';
import { checkBenchmarkRecalibration } from './recalibration.js';
import { sendTrackingGuide } from '../services/tracking-guide.js';
import {
  pauseMetaCampaign, resumeMetaCampaign,
  fetchGoogleCampaignMetrics, updateGoogleBudget,
} from '@vigmis/ad-connectors';
import { sendTenantNotification } from '../services/notify.js';
import { createProtocol } from '../routes/protocols.js';
import type { CampaignMetrics } from './rules.js';
import { buildOptimizationNarrative } from '../services/optimization-narrative.js';
import { classifyPortfolioRole } from './portfolio.js';
import { checkQualityGate } from './quality-gate.js';
import { buildDecisionMatrix, formatDecisionMatrixForProtocol } from './decision-matrix.js';

export interface OptimizationRun {
  tenantId: string;
  campaignsEvaluated: number;
  actionsApplied: number;
  approvalsPending: number;
  errors: string[];
}

// Check platform token health — returns days until expiry (null = no expiry set, negative = expired)
async function checkTokenHealth(tenantId: string, platform: string): Promise<{ ok: boolean; daysLeft: number | null }> {
  const { data } = await db
    .from('platform_tokens')
    .select('expires_at')
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .maybeSingle();

  if (!data?.expires_at) return { ok: true, daysLeft: null };
  const daysLeft = (new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return { ok: daysLeft >= 0, daysLeft: Math.floor(daysLeft) };
}

type CampaignMetricsRaw = {
  clicks: number;
  impressions: number;
  spend: number;
  conversions: number;     // platform self-reported (may inflate)
  revenue: number;         // platform self-reported
};

// Fetch Meta campaign insights — now also pulls conversions + conversion value
async function fetchMetaMetrics(
  externalId: string,
  tenantId: string,
): Promise<CampaignMetricsRaw | null> {
  try {
    const { data } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'meta')
      .single();

    if (!data) return null;

    const { decryptToken } = await import('@vigmis/db');
    const accessToken = decryptToken(data.access_token);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${externalId}/insights?` +
      `fields=clicks,impressions,spend,actions,action_values` +
      `&time_range={"since":"${dateStr}","until":"${dateStr}"}` +
      `&access_token=${accessToken}`
    );

    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{
      clicks: string; impressions: string; spend: string;
      actions?: Array<{ action_type: string; value: string }>;
      action_values?: Array<{ action_type: string; value: string }>;
    }> };
    const row = json.data?.[0];
    if (!row) return { clicks: 0, impressions: 0, spend: 0, conversions: 0, revenue: 0 };

    const conversionTypes = ['purchase', 'omni_purchase', 'lead', 'complete_registration', 'offsite_conversion.fb_pixel_purchase'];
    const conversions = (row.actions ?? [])
      .filter(a => conversionTypes.includes(a.action_type))
      .reduce((s, a) => s + parseFloat(a.value ?? '0'), 0);
    const revenue = (row.action_values ?? [])
      .filter(a => conversionTypes.includes(a.action_type))
      .reduce((s, a) => s + parseFloat(a.value ?? '0'), 0);

    return {
      clicks: parseInt(row.clicks ?? '0'),
      impressions: parseInt(row.impressions ?? '0'),
      spend: parseFloat(row.spend ?? '0'),
      conversions: Math.round(conversions),
      revenue,
    };
  } catch {
    return null;
  }
}

// GA4 ground-truth lookup: yesterday's conversions + revenue attributed to this campaign.
// Returns null when GA4 is not configured or no data matched — the engine then falls back
// to platform self-reported numbers.
async function fetchGa4ForCampaign(
  tenantId: string,
  campaign: { id: string; name: string; platform: string },
): Promise<{ conversions: number; revenue: number } | null> {
  const { data: settings } = await db
    .from('ga4_settings')
    .select('property_id, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!settings?.enabled || !settings.property_id) return null;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().slice(0, 10);

  // Try to match GA4 sessionCampaign to our campaign name first (UTMs wired correctly),
  // then fall back to platform-medium matching when names don't match.
  const sourceMap: Record<string, string[]> = {
    google:    ['google'],
    meta:      ['facebook', 'fb', 'instagram', 'ig', 'meta'],
    tiktok:    ['tiktok', 'tt'],
  };
  const sources = sourceMap[campaign.platform] ?? [campaign.platform];

  // Exact campaign-name match
  const { data: nameMatch } = await db
    .from('ga4_daily_metrics')
    .select('conversions, purchase_revenue')
    .eq('tenant_id', tenantId)
    .eq('date', date)
    .eq('session_campaign', campaign.name)
    .limit(20);

  let rows = nameMatch ?? [];

  // Fall back: platform-level aggregate (source/medium = cpc)
  if (!rows.length) {
    const { data: srcMatch } = await db
      .from('ga4_daily_metrics')
      .select('conversions, purchase_revenue')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .in('source', sources)
      .eq('medium', 'cpc')
      .limit(50);
    rows = srcMatch ?? [];
  }

  if (!rows.length) return null;
  const conversions = rows.reduce((s, r: any) => s + Number(r.conversions ?? 0), 0);
  const revenue = rows.reduce((s, r: any) => s + Number(r.purchase_revenue ?? 0), 0);
  return { conversions, revenue };
}

// Update campaign budget via Meta API
async function updateMetaBudget(
  externalId: string,
  tenantId: string,
  newDailyBudgetUsd: number,
): Promise<void> {
  const { data } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .single();

  if (!data) return;
  const { decryptToken } = await import('@vigmis/db');
  const accessToken = decryptToken(data.access_token);
  const budgetCents = Math.round(newDailyBudgetUsd * 100);

  await fetch(`https://graph.facebook.com/v19.0/${externalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      daily_budget: String(budgetCents),
      access_token: accessToken,
    }),
  });
}

// Checks if a campaign has been consistently underperforming despite optimization.
// Fires once per campaign (won't repeat if already sent in last 21 days).
async function checkStagnation(
  campaign: any,
  tenantId: string,
  daysRunning: number,
  ctr: number,
  minCtr: number,
): Promise<boolean> {
  if (daysRunning < 30) return false;
  if (ctr >= minCtr * 0.6) return false;

  const { data: recent } = await db
    .from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'optimization.campaign_stagnant')
    .contains('payload', { campaignId: campaign.id })
    .gte('created_at', new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recent?.length) return false;

  const { data: downActions } = await db
    .from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'optimization.scale_down')
    .contains('payload', { campaignId: campaign.id })
    .limit(10);

  if ((downActions?.length ?? 0) < 3) return false;

  return true;
}

function buildStagnationMessage(campaign: any, daysRunning: number, ctr: number, minCtr: number): string {
  const ctrPct = (ctr * 100).toFixed(2);
  const benchPct = (minCtr * 100).toFixed(1);
  const isDeepStagnation = daysRunning >= 60;

  if (isDeepStagnation) {
    return [
      `Vigmis has been optimizing "${campaign.name}" on ${campaign.platform} for ${daysRunning} days. Despite consistent adjustments, results have not reached an acceptable level.`,
      ``,
      `We want to be completely honest with you: at this point, continuing to invest in paid online advertising may not be the right decision for your business right now.`,
      ``,
      `Paid advertising works best when there is already some level of market demand, a strong offer, and a proven conversion path. When all of these are optimized and results still don't come, it's often a signal to step back from paid channels entirely — at least for now.`,
      ``,
      `It may make more sense to invest your time and resources in:`,
      `A. Building organic presence — SEO, content, social — before scaling with paid ads`,
      `B. Validating your offer through direct sales or referrals first`,
      `C. Improving the product or pricing before driving paid traffic`,
      `D. Waiting for a more favorable market moment (seasonality, competition level)`,
      `E. Exploring other marketing channels better suited to your stage`,
      ``,
      `Our recommendation: pause all campaigns for now. Vigmis will not charge management fees on paused campaigns. When you're ready to try again — with a revised offer, a better landing page, or a different strategy — we'll be here.`,
      ``,
      `This is not a failure. Most successful businesses go through several iterations before paid advertising becomes profitable. We'd rather tell you this now than watch you spend money without results.`,
    ].join('\n');
  }

  return [
    `Vigmis has been optimizing "${campaign.name}" on ${campaign.platform} for ${daysRunning} days, but CTR (${ctrPct}%) remains below the ${benchPct}% benchmark despite repeated adjustments.`,
    ``,
    `We want to be honest with you: when results don't improve after this long, the issue is usually outside the ads themselves. Here are things worth checking:`,
    ``,
    `A. Landing page — Does it load fast? Is the offer clear? Do visitors trust it? Even great ads can't convert a weak landing page.`,
    `B. Pricing & offer — Is your price competitive vs. others in this market? A better offer often outperforms better targeting.`,
    `C. Budget vs. competition — If competitors are spending significantly more, your budget may be too small to win auctions consistently.`,
    `D. Audience & geography — The targeting may need a fundamental rethink, not just fine-tuning.`,
    `E. Product-market fit — Paid ads amplify demand that already exists. If the product is new or the market isn't ready, ads may not be the right channel yet.`,
    ``,
    `Our honest recommendation: pause this campaign, review the points above, and consider whether a strategy change or a different approach makes sense before continuing to spend.`,
    ``,
    `If after reviewing this you'd like to try a different strategy, use the "Rethink strategy" option in your dashboard — Vigmis will start the AI interview again from scratch.`,
  ].join('\n');
}

// Proactive growth recommendations — runs once per tenant after campaign loop.
// Suggests strategic scale-ups and platform expansion when conditions are right.
async function checkProactiveGrowth(
  tenantId: string,
  campaigns: any[],
  result: OptimizationRun,
  customBenchmarks?: Record<string, CustomBenchmarkOverride>,
): Promise<void> {
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  if (!activeCampaigns.length) return;

  // Don't spam — check if we already suggested growth in the last 14 days
  const { data: recentGrowth } = await db
    .from('decision_protocols')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('type', ['campaign_scale', 'general_advice'])
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recentGrowth?.length) return;

  const platforms = [...new Set(activeCampaigns.map((c: any) => c.platform as string))];

  // Strategic scale suggestion: campaign outperforming for 7+ consecutive days
  for (const campaign of activeCampaigns) {
    const daysRunning = Math.floor(
      (Date.now() - new Date(campaign.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysRunning < 14) continue;

    const { data: snapshots } = await db
      .from('audit_log')
      .select('payload')
      .eq('tenant_id', tenantId)
      .eq('action', 'optimization.metrics_snapshot')
      .contains('payload', { campaignId: campaign.id })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(7);

    if (!snapshots || snapshots.length < 5) continue;

    const bench = getBenchmarkForStagnation(campaign.platform, campaign.campaign_type ?? 'default', customBenchmarks) as any;
    const avgCtr = snapshots.reduce((s: number, l: any) => s + ((l.payload as any).ctr ?? 0), 0) / snapshots.length;

    // Only suggest scale if consistently above goodCtr (not just at minimum)
    if (!bench.goodCtr || avgCtr < bench.goodCtr) continue;

    const currentDaily = campaign.daily_budget_usd as number;
    const suggestedDaily = Math.round(currentDaily * 1.3 * 100) / 100;
    const monthlyIncrease = Math.round((suggestedDaily - currentDaily) * 30);

    await createProtocol({
      tenantId,
      type: 'campaign_scale',
      title: `Growth opportunity: "${campaign.name}" is outperforming — ready to scale?`,
      recommendation: [
        `"${campaign.name}" on ${campaign.platform} has maintained a CTR of ${(avgCtr * 100).toFixed(2)}% over the past 7 days — well above the ${(bench.goodCtr * 100).toFixed(1)}% target.`,
        ``,
        `When a campaign performs this consistently, increasing the budget is often the highest-ROI action available. More spend reaches more of the same high-quality audience that is already responding.`,
        ``,
        `Current daily budget: $${currentDaily} (~$${Math.round(currentDaily * 30)}/month).`,
        `Suggested new daily budget: $${suggestedDaily} (+30%, ~$${monthlyIncrease}/month additional).`,
        ``,
        `This is your decision. If budget allows, this is a good time to accelerate. If you'd prefer to hold the current budget, Vigmis will continue optimizing as-is — no action needed.`,
        ``,
        `You can discuss this with Vigmis before deciding. Just reply with any questions.`,
      ].join('\n'),
      approvalText: `I approve increasing the daily budget of "${campaign.name}" from $${currentDaily} to $${suggestedDaily}.`,
      approvalSummary: `Scale "${campaign.name}" +30% to $${suggestedDaily}/day`,
      actionPayload: {
        campaignId: campaign.id,
        newBudgetUsd: suggestedDaily,
      },
      campaignId: campaign.id,
      platform: campaign.platform,
    });

    result.approvalsPending++;
    break; // One scale suggestion per run
  }

  // Platform expansion: only on one platform for 21+ days
  if (platforms.length === 1) {
    const oldestCampaign = activeCampaigns.reduce((oldest: any, c: any) =>
      new Date(c.created_at) < new Date(oldest.created_at) ? c : oldest
    );
    const oldestDays = Math.floor(
      (Date.now() - new Date(oldestCampaign.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (oldestDays < 21) return;

    // Don't suggest Google expansion if already on Google
    const currentPlatform = platforms[0];
    if (currentPlatform === 'google') return;

    const { data: recentExpansion } = await db
      .from('decision_protocols')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('type', 'general_advice')
      .ilike('title', '%Google%')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recentExpansion?.length) return;

    await createProtocol({
      tenantId,
      type: 'general_advice',
      title: `Consider adding Google Search — your campaigns have been running for ${oldestDays} days`,
      recommendation: [
        `Your campaigns on ${currentPlatform} have been running for ${oldestDays} days. This is a good time to consider whether Google Search is a fit for your business.`,
        ``,
        `Here's the key difference: ${currentPlatform === 'meta' ? 'Meta' : 'TikTok'} is a discovery channel — people see your ad while scrolling, without actively searching. Google Search captures people who are already looking for what you offer. Different intent, different conversion dynamics.`,
        ``,
        `Running both together often produces compounding results: ${currentPlatform === 'meta' ? 'Meta' : 'TikTok'} builds awareness, Google captures the demand it creates.`,
        ``,
        `Before recommending this for your specific business, a few things to assess:`,
        `1. Do people search for your product or service category on Google?`,
        `2. Is your current budget large enough to split between two platforms effectively? (Rule of thumb: at least $500/month per platform to get meaningful data)`,
        `3. Do you have the bandwidth to manage a new channel launch right now?`,
        ``,
        `Reply here to discuss further — Vigmis will ask a few specific questions and give you an honest assessment before suggesting next steps.`,
      ].join('\n'),
      approvalText: `I'd like to explore adding Google Search to my advertising strategy. Vigmis can begin planning.`,
      approvalSummary: 'Google Search expansion — approved to plan',
    });

    result.approvalsPending++;
  }
}

export async function runOptimizationForTenant(tenantId: string): Promise<OptimizationRun> {
  const result: OptimizationRun = {
    tenantId,
    campaignsEvaluated: 0,
    actionsApplied: 0,
    approvalsPending: 0,
    errors: [],
  };

  // Admin freeze — skip optimization entirely for frozen tenants.
  const { isFrozenFor } = await import('../routes/admin.js');
  const frozen = await isFrozenFor(tenantId, 'optimize');
  if (frozen.frozen) {
    result.errors.push(`Tenant frozen: ${frozen.reason}`);
    return result;
  }

  const { data: campaigns } = await db
    .from('campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'paused']);

  if (!campaigns?.length) return result;

  const { data: settings } = await db
    .from('client_settings')
    .select('risk_level, management_percentage, has_parallel_campaigns, strategy_plan, goal')
    .eq('tenant_id', tenantId)
    .single();

  // Conservative = manual approval via Decision Protocols
  const autoMode = settings?.risk_level !== 'conservative';
  // Parallel campaigns: user is running other campaigns outside Vigmis on the same platforms.
  // In this case we never suggest scaling up — budget may already be split externally.
  const hasParallelCampaigns = (settings as any)?.has_parallel_campaigns === true;
  // AI-generated client-specific benchmarks from onboarding analysis (override static defaults)
  const customBenchmarks: Record<string, CustomBenchmarkOverride> | undefined =
    (settings as any)?.strategy_plan?.custom_benchmarks ?? undefined;

  // ── Platform token health check ──────────────────────────────────────────────
  const connectedPlatforms = [...new Set(campaigns.map((c: any) => c.platform as string))];
  for (const platform of connectedPlatforms) {
    const health = await checkTokenHealth(tenantId, platform);
    if (!health.ok) {
      // Token expired — create a protocol once (check if already sent in last 7 days)
      const { data: existing } = await db.from('decision_protocols')
        .select('id').eq('tenant_id', tenantId).eq('type', 'general_advice')
        .ilike('title', `%${platform}%token expired%`)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
      if (!existing?.length) {
        await createProtocol({
          tenantId,
          type: 'general_advice',
          title: `Action required: ${platform} connection expired`,
          recommendation: `Your ${platform} API connection has expired. Vigmis can no longer fetch metrics or apply optimizations for your ${platform} campaigns.\n\nTo fix this: go to Settings → Connected Platforms → Reconnect ${platform}.\n\nUntil reconnected, your campaigns will continue running at their current settings but will not be optimized.`,
          approvalText: `I have reconnected my ${platform} account.`,
          approvalSummary: `${platform} reconnected`,
          platform,
        });
        await sendTenantNotification(
          tenantId,
          `Action required: ${platform} connection expired`,
          `Your ${platform} connection has expired. Vigmis cannot optimize your campaigns until you reconnect. Go to Settings → Connected Platforms.`,
          'critical',
          'Reconnect in Settings',
        ).catch(() => {});
      }
      // Skip optimization for campaigns on this platform
    } else if (health.daysLeft !== null && health.daysLeft <= 5) {
      // Expiring soon — warn but continue
      const { data: existing } = await db.from('decision_protocols')
        .select('id').eq('tenant_id', tenantId).eq('type', 'general_advice')
        .ilike('title', `%${platform}%expiring%`)
        .gte('created_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
      if (!existing?.length) {
        await sendTenantNotification(
          tenantId,
          `${platform} connection expiring in ${health.daysLeft} day(s)`,
          `Your ${platform} API token expires in ${health.daysLeft} day(s). Please reconnect from Settings → Connected Platforms to avoid interruption.`,
          'warning',
          'Reconnect in Settings',
        ).catch(() => {});
      }
    }
  }

  for (const campaign of campaigns) {
    result.campaignsEvaluated++;

    try {
      let metrics: CampaignMetricsRaw | null = null;

      if (campaign.platform === 'meta' && campaign.external_id) {
        metrics = await fetchMetaMetrics(campaign.external_id, tenantId);
      } else if (campaign.platform === 'google' && campaign.external_id) {
        metrics = await fetchGoogleCampaignMetrics(campaign.external_id, tenantId);
      }
      // TikTok metrics will be wired when Marketing API is approved

      if (!metrics) metrics = { clicks: 0, impressions: 0, spend: 0, conversions: 0, revenue: 0 };

      // Cross-check with GA4 ground truth when available
      const ga4 = await fetchGa4ForCampaign(tenantId, campaign).catch(() => null);
      if (ga4) {
        // Prefer GA4 conversions/revenue (single source of truth, no double counting).
        // Keep platform clicks/impressions/spend — GA4 doesn't have those.
        metrics = {
          ...metrics,
          conversions: ga4.conversions,
          revenue: ga4.revenue,
        };
      }

      const daysRunning = Math.max(1, Math.floor(
        (Date.now() - new Date(campaign.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ));

      // Creative fatigue: fetch CTR trend from metric snapshots
      let recentCtr: number | undefined;
      let baselineCtr: number | undefined;
      if (daysRunning >= 7 && metrics.impressions > 0) {
        const { data: logs } = await db
          .from('audit_log')
          .select('payload, created_at')
          .eq('tenant_id', tenantId)
          .eq('action', 'optimization.metrics_snapshot')
          .contains('payload', { campaignId: campaign.id })
          .order('created_at', { ascending: false })
          .limit(14);

        if (logs && logs.length >= 6) {
          const recent = logs.slice(0, 3);
          const baseline = logs.slice(3, 7);
          const avg = (arr: typeof logs) =>
            arr.reduce((s, l) => s + ((l.payload as any).ctr ?? 0), 0) / arr.length;
          recentCtr = avg(recent);
          baselineCtr = avg(baseline);
        }
      }

      const campaignMetrics: CampaignMetrics = {
        campaignId: campaign.id,
        externalId: campaign.external_id ?? '',
        platform: campaign.platform as 'google' | 'meta' | 'tiktok',
        campaignType: campaign.campaign_type ?? 'default',
        clicks: metrics.clicks,
        impressions: metrics.impressions,
        spend: metrics.spend,
        conversions: metrics.conversions,
        revenue: metrics.revenue,
        attributionSource: ga4 ? 'ga4' : 'platform',
        dailyBudgetUsd: campaign.daily_budget_usd,
        daysRunning,
        status: campaign.status,
        recentCtr,
        baselineCtr,
      };

      // Skip optimization for campaigns currently in an A/B test —
      // budget changes would corrupt the 50/50 split we set up for the test.
      const inAbTest = await hasActiveAbTest(tenantId, campaign.id);
      if (inAbTest) {
        continue;
      }

      let action = evaluateCampaign(campaignMetrics, customBenchmarks);

      // If user has parallel campaigns on the same platform, don't scale up —
      // we don't know the full picture of their budget allocation.
      if (hasParallelCampaigns && action.type === 'scale_up') {
        action = {
          type: 'no_action',
          reason: 'Scale-up skipped: you indicated you have parallel campaigns outside Vigmis. Adjust budget manually if desired.',
        };
      }

      // ── Optimization Brain: Portfolio + Quality Gate ──────────────────────────
      // Classify what role this campaign plays in the overall portfolio, then
      // validate that we have enough data to make the recommended action.
      const portfolioClassification = classifyPortfolioRole(campaignMetrics);
      const gate = checkQualityGate(action, campaignMetrics, portfolioClassification.role);

      if (!gate.shouldAct) {
        // Insufficient data — log "monitor_only" and skip the action entirely.
        // This prevents the engine from making budget moves based on 1-2 days of data.
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.monitor_only',
          platform: campaign.platform,
          actor: 'system',
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            proposedAction: action.type,
            portfolioRole: portfolioClassification.role,
            gateReason: gate.reason,
            monitorHours: gate.monitorHours,
          },
        }).then(() => {});
        continue;
      }

      // ── Stagnation check (independent of normal action flow) ─────────────────
      const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;
      const bench = getBenchmarkForStagnation(campaign.platform, campaign.campaign_type ?? 'default', customBenchmarks);
      const isStagnant = await checkStagnation(campaign, tenantId, daysRunning, ctr, bench.minCtr);

      if (isStagnant) {
        const message = buildStagnationMessage(campaign, daysRunning, ctr, bench.minCtr);
        const isDeep = daysRunning >= 60;
        const title = isDeep
          ? `Honest assessment: consider pausing paid ads for now`
          : `"${campaign.name}" — results not improving after ${daysRunning} days`;

        await createProtocol({
          tenantId,
          type: 'stagnation_alert',
          title,
          recommendation: message,
          approvalText: isDeep
            ? `I acknowledge this assessment and choose to pause all campaigns for now.`
            : `I acknowledge this assessment and will review my strategy.`,
          approvalSummary: isDeep
            ? 'Acknowledged — considering pause'
            : 'Acknowledged — will review strategy',
          actionPayload: isDeep ? { campaignId: campaign.id } : {},
          campaignId: campaign.id,
          platform: campaign.platform,
        });

        await sendTenantNotification(
          tenantId,
          title,
          message,
          isDeep ? 'critical' : 'warning',
          'Review this assessment in your dashboard',
        ).catch(() => {});

        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.campaign_stagnant',
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, campaignName: campaign.name, daysRunning, ctr },
        });
      }

      // ── Day 1: welcome + conversion tracking guide ────────────────────────────
      if (daysRunning === 1 && metrics.impressions > 0) {
        await sendTenantNotification(
          tenantId,
          `Campaign "${campaign.name}" is live`,
          `Your ${campaign.platform} campaign is running. For the first ${campaign.campaign_type === 'conversions' ? '10' : '7'} days, Vigmis is collecting data before making budget changes. You'll receive alerts immediately if anything looks wrong.`,
          'info',
        ).catch(() => {});
        // Send pixel/conversion tracking setup guide
        await sendTrackingGuide(tenantId, campaign.id, campaign.name, campaign.platform).catch(() => {});
      }

      if (action.type === 'no_action') {
        // Still snapshot metrics
        if (metrics.impressions > 0) {
          await db.from('audit_log').insert({
            tenant_id: tenantId,
            action: 'optimization.metrics_snapshot',
            platform: campaign.platform,
            actor: 'system',
            payload: { campaignId: campaign.id, clicks: metrics.clicks, impressions: metrics.impressions, spend: metrics.spend, ctr },
          }).then(() => {});
        }
        continue;
      }

      // ── Budget/status actions: conservative → protocol, auto → execute ────────

      const newBudget = (action.type === 'scale_up' || action.type === 'scale_down')
        ? Math.max(1, Math.round(campaign.daily_budget_usd * action.factor * 100) / 100)
        : 0;

      if (autoMode === false && (
        action.type === 'scale_up' ||
        action.type === 'scale_down' ||
        action.type === 'pause' ||
        action.type === 'resume'
      )) {
        // Conservative mode → create Decision Protocol with AI-generated narrative
        const protocolConfig = {
          scale_up: {
            type: 'campaign_scale' as const,
            title: `Scale up "${campaign.name}" (+20% budget)`,
            approvalText: `I approve increasing the daily budget of "${campaign.name}" from $${campaign.daily_budget_usd} to $${newBudget}.`,
          },
          scale_down: {
            type: 'budget_change' as const,
            title: `Reduce budget for "${campaign.name}" (-20%)`,
            approvalText: `I approve reducing the daily budget of "${campaign.name}" from $${campaign.daily_budget_usd} to $${newBudget}.`,
          },
          pause: {
            type: 'campaign_pause' as const,
            title: `Pause campaign "${campaign.name}"`,
            approvalText: `I approve pausing "${campaign.name}" on ${campaign.platform}.`,
          },
          resume: {
            type: 'campaign_resume' as const,
            title: `Resume campaign "${campaign.name}"`,
            approvalText: `I approve resuming "${campaign.name}" on ${campaign.platform}.`,
          },
        }[action.type];

        const strategyPlan = (settings as any)?.strategy_plan;
        const richRecommendation = await buildOptimizationNarrative({
          campaignName: campaign.name,
          platform: campaign.platform,
          campaignType: campaign.campaign_type ?? 'default',
          actionType: action.type,
          ruleReason: action.reason,
          metrics: {
            clicks: metrics.clicks,
            impressions: metrics.impressions,
            ctr,
            spend: metrics.spend,
            dailyBudgetUsd: campaign.daily_budget_usd,
            daysRunning,
            conversions: metrics.conversions,
            revenue: metrics.revenue,
            attributionSource: campaignMetrics.attributionSource,
          },
          proposedChange: newBudget ? `$${campaign.daily_budget_usd}/day → $${newBudget}/day` : undefined,
          businessGoal: (settings as any)?.goal,
          strategyNarrative: typeof strategyPlan?.strategy_narrative === 'string'
            ? strategyPlan.strategy_narrative.slice(0, 400)
            : undefined,
          targetAudience: typeof strategyPlan?.target_audience === 'string'
            ? strategyPlan.target_audience
            : undefined,
        });

        // Build Decision Matrix — 3 options (Conservative/Balanced/Aggressive)
        const matrix = buildDecisionMatrix(action, campaignMetrics, portfolioClassification.role, gate);
        const matrixText = formatDecisionMatrixForProtocol(matrix);
        const fullRecommendation = richRecommendation + matrixText;

        await createProtocol({
          tenantId,
          type: protocolConfig.type,
          title: protocolConfig.title,
          recommendation: fullRecommendation,
          approvalText: protocolConfig.approvalText,
          approvalSummary: protocolConfig.title,
          actionPayload: {
            campaignId: campaign.id,
            newBudgetUsd: newBudget || undefined,
            decisionMatrix: { options: matrix.options, recommendedIndex: matrix.recommendedIndex },
          },
          campaignId: campaign.id,
          platform: campaign.platform,
        });

        result.approvalsPending++;
        continue;
      }

      // Auto mode: execute immediately.
      // Safety: never auto-execute budget changes when confidence is low —
      // create a protocol for human review instead.
      if (gate.confidence === 'low' && (action.type === 'scale_up' || action.type === 'scale_down')) {
        const matrix = buildDecisionMatrix(action, campaignMetrics, portfolioClassification.role, gate);
        const matrixText = formatDecisionMatrixForProtocol(matrix);
        await createProtocol({
          tenantId,
          type: action.type === 'scale_up' ? 'campaign_scale' : 'budget_change',
          title: `Review needed: "${campaign.name}" — low confidence (${gate.reason.slice(0, 80)})`,
          recommendation: `Vigmis detected a signal to ${action.type.replace('_', ' ')} this campaign but does not have enough data to act automatically.\n\n${gate.reason}${matrixText}`,
          approvalText: `I have reviewed the data and approve the Balanced option for "${campaign.name}".`,
          approvalSummary: `${action.type.replace('_', ' ')} — pending human review`,
          actionPayload: { campaignId: campaign.id, newBudgetUsd: newBudget || undefined },
          campaignId: campaign.id,
          platform: campaign.platform,
        });
        result.approvalsPending++;
        continue;
      }

      if (action.type === 'pause' && campaign.external_id) {
        if (campaign.platform === 'meta') await pauseMetaCampaign(campaign.external_id, tenantId);
        await db.from('campaigns')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
        // Critical alert: campaign was auto-paused — user must know immediately.
        await sendTenantNotification(
          tenantId,
          `Campaign "${campaign.name}" auto-paused`,
          `Vigmis automatically paused "${campaign.name}" on ${campaign.platform}. Reason: ${action.reason}`,
          'critical',
          'Review and resume in dashboard',
        ).catch(() => {});
      }

      if (action.type === 'resume' && campaign.external_id) {
        if (campaign.platform === 'meta') await resumeMetaCampaign(campaign.external_id, tenantId);
        await db.from('campaigns')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
      }

      if ((action.type === 'scale_up' || action.type === 'scale_down') && campaign.external_id) {
        if (campaign.platform === 'meta') await updateMetaBudget(campaign.external_id, tenantId, newBudget);
        else if (campaign.platform === 'google') await updateGoogleBudget(campaign.external_id, tenantId, newBudget);
        // TikTok budget updates will be wired when Marketing API is approved
        await db.from('campaigns')
          .update({ daily_budget_usd: newBudget, updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
        // Critical alert for scale_down: budget was cut automatically — inform user.
        if (action.type === 'scale_down') {
          await sendTenantNotification(
            tenantId,
            `Budget reduced for "${campaign.name}"`,
            `Vigmis reduced the daily budget for "${campaign.name}" on ${campaign.platform} from $${campaign.daily_budget_usd} to $${newBudget}. Reason: ${action.reason}`,
            'critical',
            'Review in dashboard',
          ).catch(() => {});
        }
      }

      // ── Advisory actions: always create a protocol regardless of mode ─────────

      if (action.type === 'alert') {
        await sendTenantNotification(
          tenantId,
          `Campaign "${campaign.name}" needs attention`,
          action.reason,
          action.severity,
          'Open your decision protocols in the dashboard',
        ).catch(() => {});
        await createProtocol({
          tenantId,
          type: 'general_advice',
          title: `${action.severity === 'critical' ? 'Alert' : 'Notice'}: "${campaign.name}" — ${action.reason.slice(0, 80)}`,
          recommendation: action.reason,
          approvalText: `I have reviewed this alert for "${campaign.name}" and will take action.`,
          approvalSummary: 'Alert reviewed',
          campaignId: campaign.id,
          platform: campaign.platform,
        });
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.alert',
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, campaignName: campaign.name, reason: action.reason, severity: action.severity },
        });
        result.actionsApplied++;
        continue;
      }

      if (action.type === 'needs_targeting_review') {
        const strategyPlan = (settings as any)?.strategy_plan;
        const targetingNarrative = await buildOptimizationNarrative({
          campaignName: campaign.name,
          platform: campaign.platform,
          campaignType: campaign.campaign_type ?? 'default',
          actionType: 'needs_targeting_review',
          ruleReason: action.reason,
          metrics: { clicks: metrics.clicks, impressions: metrics.impressions, ctr, spend: metrics.spend, dailyBudgetUsd: campaign.daily_budget_usd, daysRunning },
          businessGoal: (settings as any)?.goal,
          strategyNarrative: typeof strategyPlan?.strategy_narrative === 'string' ? strategyPlan.strategy_narrative.slice(0, 400) : undefined,
          targetAudience: typeof strategyPlan?.target_audience === 'string' ? strategyPlan.target_audience : undefined,
        });
        await createProtocol({
          tenantId,
          type: 'targeting_review',
          title: `Targeting review needed: "${campaign.name}"`,
          recommendation: targetingNarrative,
          approvalText: `I approve reviewing and recommending targeting changes for "${campaign.name}" on ${campaign.platform}.`,
          approvalSummary: 'Targeting review approved',
          campaignId: campaign.id,
          platform: campaign.platform,
        });
        await sendTenantNotification(
          tenantId,
          `Targeting review needed: "${campaign.name}"`,
          action.reason,
          'warning',
          'See your pending decisions in the dashboard',
        ).catch(() => {});
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.needs_targeting_review',
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, campaignName: campaign.name, reason: action.reason },
        });
        result.actionsApplied++;
        continue;
      }

      if (action.type === 'needs_creative') {
        const strategyPlan = (settings as any)?.strategy_plan;
        const creativeNarrative = await buildOptimizationNarrative({
          campaignName: campaign.name,
          platform: campaign.platform,
          campaignType: campaign.campaign_type ?? 'default',
          actionType: 'needs_creative',
          ruleReason: action.reason,
          metrics: {
            clicks: metrics.clicks, impressions: metrics.impressions, ctr, spend: metrics.spend,
            dailyBudgetUsd: campaign.daily_budget_usd, daysRunning,
            conversions: metrics.conversions, revenue: metrics.revenue,
            attributionSource: campaignMetrics.attributionSource,
          },
          proposedChange: 'creative refresh — generate new variation',
          businessGoal: (settings as any)?.goal,
          strategyNarrative: typeof strategyPlan?.strategy_narrative === 'string' ? strategyPlan.strategy_narrative.slice(0, 400) : undefined,
          targetAudience: typeof strategyPlan?.target_audience === 'string' ? strategyPlan.target_audience : undefined,
        });
        await createProtocol({
          tenantId,
          type: 'creative_refresh',
          title: `Creative refresh needed: "${campaign.name}"`,
          recommendation: creativeNarrative,
          approvalText: `I approve generating a new creative variation for "${campaign.name}" on ${campaign.platform}.`,
          approvalSummary: 'Creative refresh approved',
          campaignId: campaign.id,
          platform: campaign.platform,
        });
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.creative_fatigue',
          platform: campaign.platform,
          actor: 'system',
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            recentCtr: campaignMetrics.recentCtr,
            baselineCtr: campaignMetrics.baselineCtr,
            reason: action.reason,
          },
        });
        result.actionsApplied++;
      }

      // Snapshot metrics for trend analysis
      if (metrics.impressions > 0) {
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.metrics_snapshot',
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, clicks: metrics.clicks, impressions: metrics.impressions, spend: metrics.spend, ctr },
        }).then(() => {});
      }

      // Log auto-applied budget/status actions
      if (action.type === 'scale_up' || action.type === 'scale_down' || action.type === 'pause' || action.type === 'resume') {
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: `optimization.${action.type}`,
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, action, metrics },
        });
      }

    } catch (err) {
      result.errors.push(`Campaign ${campaign.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Proactive growth recommendations (once per tenant, after all campaigns evaluated)
  await checkProactiveGrowth(tenantId, campaigns, result, customBenchmarks).catch(() => {});

  // A/B test evaluation — auto-conclude tests when statistically significant
  await evaluateAbTests(tenantId).catch(() => {});

  // 30-day benchmark recalibration — suggest updated thresholds if real data diverges
  await checkBenchmarkRecalibration(tenantId).catch(() => {});

  return result;
}

// Run optimization for ALL tenants (called by cron/scheduler).
// planFilter='pro' → only Pro tenants (for the 3 extra daily Pro runs).
export async function runOptimizationAll(planFilter?: 'pro'): Promise<OptimizationRun[]> {
  let tenantIds: string[] | undefined;

  if (planFilter === 'pro') {
    const { data: proTenants } = await db
      .from('billing_customers')
      .select('tenant_id')
      .eq('plan', 'pro');
    if (!proTenants?.length) return [];
    tenantIds = proTenants.map((t: any) => t.tenant_id as string);
  }

  const baseQuery = db.from('tenants').select('id');
  const { data: tenants } = tenantIds
    ? await baseQuery.in('id', tenantIds)
    : await baseQuery;
  if (!tenants?.length) return [];

  const results = await Promise.allSettled(
    tenants.map(t => runOptimizationForTenant(t.id))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<OptimizationRun> => r.status === 'fulfilled')
    .map(r => r.value);
}

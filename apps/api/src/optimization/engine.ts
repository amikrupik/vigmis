// Optimization Engine — runs periodically to improve all campaigns
// Called by: POST /optimization/run (or a cron job)
//
// Flow:
// 1. Load all active campaigns for all tenants
// 2. Fetch metrics from platform APIs (or use stored metrics)
// 3. Evaluate each campaign using rules engine
// 4. Apply approved actions (auto-mode) or create approval requests (manual mode)
// 5. Log everything to audit_log

import { db } from '@vigmis/db';
import { evaluateCampaign, getBenchmarkForStagnation } from './rules.js';
import { pauseMetaCampaign, resumeMetaCampaign } from '@vigmis/ad-connectors';
import { sendTenantNotification } from '../services/notify.js';
import type { CampaignMetrics } from './rules.js';

export interface OptimizationRun {
  tenantId: string;
  campaignsEvaluated: number;
  actionsApplied: number;
  approvalsPending: number;
  errors: string[];
}

// Fetch Meta campaign insights
async function fetchMetaMetrics(
  externalId: string,
  tenantId: string,
): Promise<{ clicks: number; impressions: number; spend: number } | null> {
  try {
    const { data } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'meta')
      .single();

    if (!data) return null;

    // Import decryptToken
    const { decryptToken } = await import('@vigmis/db');
    const accessToken = decryptToken(data.access_token);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${externalId}/insights?` +
      `fields=clicks,impressions,spend&time_range={"since":"${dateStr}","until":"${dateStr}"}` +
      `&access_token=${accessToken}`
    );

    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ clicks: string; impressions: string; spend: string }> };
    const row = json.data?.[0];
    if (!row) return { clicks: 0, impressions: 0, spend: 0 };

    return {
      clicks: parseInt(row.clicks ?? '0'),
      impressions: parseInt(row.impressions ?? '0'),
      spend: parseFloat(row.spend ?? '0'),
    };
  } catch {
    return null;
  }
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
  if (ctr >= minCtr * 0.6) return false; // not that bad

  // Already sent a stagnation notice for this campaign recently?
  const { data: recent } = await db
    .from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'optimization.campaign_stagnant')
    .contains('payload', { campaignId: campaign.id })
    .gte('created_at', new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recent?.length) return false; // already notified recently

  // How many scale_down actions have been applied to this campaign?
  const { data: downActions } = await db
    .from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'optimization.scale_down')
    .contains('payload', { campaignId: campaign.id })
    .limit(10);

  if ((downActions?.length ?? 0) < 3) return false; // not enough evidence of repeated attempts

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

export async function runOptimizationForTenant(tenantId: string): Promise<OptimizationRun> {
  const result: OptimizationRun = {
    tenantId,
    campaignsEvaluated: 0,
    actionsApplied: 0,
    approvalsPending: 0,
    errors: [],
  };

  // Load active campaigns
  const { data: campaigns } = await db
    .from('campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'paused']);

  if (!campaigns?.length) return result;

  // Load client settings to check optimization mode
  const { data: settings } = await db
    .from('client_settings')
    .select('risk_level, management_percentage')
    .eq('tenant_id', tenantId)
    .single();

  const autoMode = settings?.risk_level !== 'conservative'; // conservative = manual approval

  for (const campaign of campaigns) {
    result.campaignsEvaluated++;

    try {
      // Get metrics
      let metrics: { clicks: number; impressions: number; spend: number } | null = null;

      if (campaign.platform === 'meta' && campaign.external_id) {
        metrics = await fetchMetaMetrics(campaign.external_id, tenantId);
      }
      // Google metrics will be added when developer token is approved

      if (!metrics) {
        metrics = { clicks: 0, impressions: 0, spend: 0 };
      }

      const daysRunning = Math.max(1, Math.floor(
        (Date.now() - new Date(campaign.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ));

      // Creative fatigue: fetch audit_log for CTR trend
      let recentCtr: number | undefined;
      let baselineCtr: number | undefined;
      if (daysRunning >= 7 && metrics.impressions > 0) {
        // Use stored historical snapshots from audit_log if available
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
          const avg = (arr: typeof logs) => {
            const total = arr.reduce((s, l) => {
              const p = l.payload as any;
              return s + (p.ctr ?? 0);
            }, 0);
            return total / arr.length;
          };
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
        dailyBudgetUsd: campaign.daily_budget_usd,
        daysRunning,
        status: campaign.status,
        recentCtr,
        baselineCtr,
      };

      const action = evaluateCampaign(campaignMetrics);

      // Stagnation check — runs independently of the normal action flow
      const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;
      const bench = getBenchmarkForStagnation(campaign.platform, campaign.campaign_type ?? 'default');
      const isStagnant = await checkStagnation(campaign, tenantId, daysRunning, ctr, bench.minCtr);
      if (isStagnant) {
        const message = buildStagnationMessage(campaign, daysRunning, ctr, bench.minCtr);
        const isDeep = daysRunning >= 60;
        const title = isDeep
          ? `Honest assessment: consider pausing paid ads for now`
          : `"${campaign.name}" — results not improving after ${daysRunning} days`;
        const actionText = isDeep
          ? 'Pause campaigns — no fees charged on paused campaigns'
          : 'Open dashboard to review or rethink strategy';
        await sendTenantNotification(
          tenantId,
          title,
          message,
          isDeep ? 'critical' : 'warning',
          actionText,
        ).catch(() => {});
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.campaign_stagnant',
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, campaignName: campaign.name, daysRunning, ctr },
        });
      }

      // On day 1, send the client a "learning period" explanation so they know what to expect
      if (daysRunning === 1 && metrics.impressions > 0) {
        await sendTenantNotification(
          tenantId,
          `Campaign "${campaign.name}" is live`,
          `Your ${campaign.platform} campaign is running. For the first ${campaign.campaign_type === 'conversions' ? '10' : '7'} days, Vigmis is collecting data before making budget changes. You'll receive alerts immediately if anything looks wrong.`,
          'info',
        ).catch(() => {});
      }

      if (action.type === 'no_action') continue;

      // Auto mode: apply immediately. Manual mode: create approval request.
      if (!autoMode && action.type !== 'pause') {
        // Create approval request
        await db.from('approval_request').insert({
          tenant_id: tenantId,
          action_type: action.type,
          platform: campaign.platform,
          payload: { campaignId: campaign.id, action, metrics },
          status: 'pending',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        result.approvalsPending++;
        continue;
      }

      // Apply action
      if (action.type === 'pause' && campaign.external_id) {
        if (campaign.platform === 'meta') {
          await pauseMetaCampaign(campaign.external_id, tenantId);
        }
        await db.from('campaigns')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
      }

      if (action.type === 'resume' && campaign.external_id) {
        if (campaign.platform === 'meta') {
          await resumeMetaCampaign(campaign.external_id, tenantId);
        }
        await db.from('campaigns')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
      }

      if ((action.type === 'scale_up' || action.type === 'scale_down') && campaign.external_id) {
        const factor = action.factor;
        const newBudget = Math.max(1, Math.round(campaign.daily_budget_usd * factor * 100) / 100);

        if (campaign.platform === 'meta') {
          await updateMetaBudget(campaign.external_id, tenantId, newBudget);
        }
        // Google + TikTok budget updates will be wired when APIs are approved

        await db.from('campaigns')
          .update({ daily_budget_usd: newBudget, updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
      }

      // Alert: notify client, no budget change
      if (action.type === 'alert') {
        await sendTenantNotification(
          tenantId,
          `Campaign "${campaign.name}" needs attention`,
          action.reason,
          action.severity,
          'Review your campaigns in the dashboard',
        ).catch(() => {});
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: `optimization.alert`,
          platform: campaign.platform,
          actor: 'system',
          payload: { campaignId: campaign.id, campaignName: campaign.name, reason: action.reason, severity: action.severity },
        });
        result.actionsApplied++;
        continue;
      }

      // Targeting review: notify client + log — AI should suggest new keywords/audiences
      if (action.type === 'needs_targeting_review') {
        await sendTenantNotification(
          tenantId,
          `Targeting review needed: "${campaign.name}"`,
          action.reason,
          'warning',
          'Vigmis will review keywords and audiences and suggest improvements',
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

      // Creative fatigue: log alert to dismissed_alerts so deliverAlert can pick it up
      if (action.type === 'needs_creative') {
        // Log a metrics snapshot for future fatigue detection
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
        const ctr = metrics.clicks / metrics.impressions;
        await db.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'optimization.metrics_snapshot',
          platform: campaign.platform,
          actor: 'system',
          payload: {
            campaignId: campaign.id,
            clicks: metrics.clicks,
            impressions: metrics.impressions,
            spend: metrics.spend,
            ctr,
          },
        }).then(() => {}); // fire-and-forget, don't block
      }

      // Log action
      await db.from('audit_log').insert({
        tenant_id: tenantId,
        action: `optimization.${action.type}`,
        platform: campaign.platform,
        actor: 'system',
        payload: { campaignId: campaign.id, action, metrics },
      });

    } catch (err) {
      result.errors.push(`Campaign ${campaign.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

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

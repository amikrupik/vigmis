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
import { evaluateCampaign } from './rules.js';
import { pauseMetaCampaign, resumeMetaCampaign } from '@vigmis/ad-connectors';
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

  const autoMode = true; // TODO: read from settings when UI toggle is added

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

      const campaignMetrics: CampaignMetrics = {
        campaignId: campaign.id,
        externalId: campaign.external_id ?? '',
        platform: campaign.platform as 'google' | 'meta',
        clicks: metrics.clicks,
        impressions: metrics.impressions,
        spend: metrics.spend,
        dailyBudgetUsd: campaign.daily_budget_usd,
        daysRunning,
        status: campaign.status,
      };

      const action = evaluateCampaign(campaignMetrics);

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

        await db.from('campaigns')
          .update({ daily_budget_usd: newBudget, updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        result.actionsApplied++;
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

// Run optimization for ALL tenants (called by cron/scheduler)
export async function runOptimizationAll(): Promise<OptimizationRun[]> {
  const { data: tenants } = await db.from('tenants').select('id');
  if (!tenants?.length) return [];

  const results = await Promise.allSettled(
    tenants.map(t => runOptimizationForTenant(t.id))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<OptimizationRun> => r.status === 'fulfilled')
    .map(r => r.value);
}

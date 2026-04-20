// Benchmark Recalibration
// After 30 days of real campaign data, compares observed CTR against the AI-generated
// custom benchmarks from onboarding. If there's a significant gap (>25%), suggests
// updated thresholds based on actual performance in this client's market.

import { db } from '@vigmis/db';
import { createProtocol } from '../routes/protocols.js';

const INTERVAL_DAYS    = 30;
const MIN_CLICKS       = 100;   // minimum clicks per campaign type before recalibrating
const DELTA_THRESHOLD  = 0.25;  // 25% gap triggers a suggestion

export async function checkBenchmarkRecalibration(tenantId: string): Promise<void> {
  // Run at most once per 30 days
  const { data: recent } = await db
    .from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'optimization.recalibration_check')
    .gte('created_at', new Date(Date.now() - INTERVAL_DAYS * 864e5).toISOString())
    .limit(1);

  if (recent?.length) return;

  // Load current custom benchmarks
  const { data: settings } = await db
    .from('client_settings')
    .select('strategy_plan')
    .eq('tenant_id', tenantId)
    .single();

  const customBenchmarks = (settings as any)?.strategy_plan?.custom_benchmarks as Record<string, any> | undefined;
  if (!customBenchmarks || !Object.keys(customBenchmarks).length) return;

  // Load campaigns so we can map campaignId → platform+type
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id, platform, campaign_type')
    .eq('tenant_id', tenantId);

  if (!campaigns?.length) return;
  const campaignMap = Object.fromEntries(
    campaigns.map((c: any) => [c.id, { platform: c.platform, type: c.campaign_type }])
  );

  // Load 30 days of metric snapshots
  const { data: snapshots } = await db
    .from('audit_log')
    .select('payload')
    .eq('tenant_id', tenantId)
    .eq('action', 'optimization.metrics_snapshot')
    .gte('created_at', new Date(Date.now() - INTERVAL_DAYS * 864e5).toISOString());

  // Aggregate clicks + impressions per platform_campaignType
  const observed: Record<string, { clicks: number; impressions: number }> = {};
  for (const snap of snapshots ?? []) {
    const p = snap.payload as any;
    const meta = campaignMap[p.campaignId];
    if (!meta) continue;
    const key = `${meta.platform}_${meta.type}`;
    if (!observed[key]) observed[key] = { clicks: 0, impressions: 0 };
    observed[key].clicks     += p.clicks ?? 0;
    observed[key].impressions += p.impressions ?? 0;
  }

  // Compare observed vs current benchmarks
  const suggestions: Array<{
    key: string;
    currentMinCtr: number;
    currentGoodCtr: number;
    observedCtr: number;
    suggestedMinCtr: number;
    suggestedGoodCtr: number;
    totalClicks: number;
  }> = [];

  for (const [key, data] of Object.entries(observed)) {
    if (data.clicks < MIN_CLICKS) continue;
    const bench = customBenchmarks[key];
    if (!bench) continue;

    const observedCtr = data.clicks / Math.max(data.impressions, 1);

    // Only flag if the midpoint between min and good is >25% off from observed
    const benchMid = (bench.minCtr + bench.goodCtr) / 2;
    const delta = Math.abs(observedCtr - benchMid) / benchMid;
    if (delta < DELTA_THRESHOLD) continue;

    // New thresholds: min = 70% of observed, good = 130% of observed
    const suggestedMinCtr  = parseFloat((observedCtr * 0.70).toFixed(4));
    const suggestedGoodCtr = parseFloat((observedCtr * 1.30).toFixed(4));

    suggestions.push({
      key,
      currentMinCtr: bench.minCtr,
      currentGoodCtr: bench.goodCtr,
      observedCtr,
      suggestedMinCtr,
      suggestedGoodCtr,
      totalClicks: data.clicks,
    });
  }

  // Record that the check ran (regardless of suggestions)
  await db.from('audit_log').insert({
    tenant_id: tenantId,
    action: 'optimization.recalibration_check',
    actor: 'system',
    payload: { suggestionsCount: suggestions.length, keysChecked: Object.keys(observed).length },
  });

  if (!suggestions.length) return;

  // Build the protocol recommendation
  const summaryLines = suggestions.map(s => {
    const [platform, ...rest] = s.key.split('_');
    const campaignType = rest.join('_');
    return [
      `${platform.toUpperCase()} ${campaignType}:`,
      `  Observed CTR over 30 days: ${(s.observedCtr * 100).toFixed(2)}% (${s.totalClicks} clicks)`,
      `  Current benchmarks: min ${(s.currentMinCtr * 100).toFixed(2)}% / good ${(s.currentGoodCtr * 100).toFixed(2)}%`,
      `  Suggested: min ${(s.suggestedMinCtr * 100).toFixed(2)}% / good ${(s.suggestedGoodCtr * 100).toFixed(2)}%`,
    ].join('\n');
  });

  await createProtocol({
    tenantId,
    type: 'general_advice',
    title: `Benchmark update ready — 30 days of real data collected`,
    recommendation: [
      `Vigmis has now collected 30 days of real performance data from your campaigns. Based on this, the optimization benchmarks can be refined to better match actual conditions in your market.`,
      ``,
      `Why this matters: the initial benchmarks were AI estimates from your onboarding analysis. After 30 days of real data from your specific audience, budget, and creative, we can calibrate them precisely. More accurate benchmarks mean fewer false alarms and better scale/pause decisions.`,
      ``,
      `Proposed updates:`,
      ``,
      ...summaryLines,
      ``,
      `Approving this updates Vigmis's thresholds immediately. Another recalibration will be offered after the next 30 days of data.`,
      ``,
      `If you'd like to discuss any of these numbers first, reply here and Vigmis will explain the reasoning.`,
    ].join('\n'),
    approvalText: `I approve updating Vigmis's performance benchmarks based on 30 days of real campaign data.`,
    approvalSummary: `Benchmark recalibration — ${suggestions.length} campaign type(s) updated`,
    actionPayload: {
      type: 'benchmark_recalibration',
      suggestions: suggestions.map(s => ({
        key: s.key,
        suggestedMinCtr: s.suggestedMinCtr,
        suggestedGoodCtr: s.suggestedGoodCtr,
      })),
    },
  });
}

// Applies approved recalibration — called from the protocol approve handler.
export async function applyBenchmarkRecalibration(
  tenantId: string,
  suggestions: Array<{ key: string; suggestedMinCtr: number; suggestedGoodCtr: number }>,
): Promise<void> {
  const { data: settings } = await db
    .from('client_settings')
    .select('strategy_plan')
    .eq('tenant_id', tenantId)
    .single();

  if (!settings) return;

  const strategyPlan = (settings as any).strategy_plan ?? {};
  const currentBenchmarks = strategyPlan.custom_benchmarks ?? {};

  const updated = { ...currentBenchmarks };
  for (const s of suggestions) {
    if (updated[s.key]) {
      updated[s.key] = {
        ...updated[s.key],
        minCtr: s.suggestedMinCtr,
        goodCtr: s.suggestedGoodCtr,
      };
    }
  }

  await db.from('client_settings').update({
    strategy_plan: { ...strategyPlan, custom_benchmarks: updated },
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId);

  await db.from('audit_log').insert({
    tenant_id: tenantId,
    action: 'optimization.benchmarks_recalibrated',
    actor: 'user',
    payload: { updatedKeys: suggestions.map(s => s.key) },
  });
}

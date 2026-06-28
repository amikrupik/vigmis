// Strategic Brain — weekly portfolio-level intelligence.
//
// Runs once per week per tenant. Looks across ALL campaigns, evaluates whether
// the original strategy hypothesis still holds, and produces 3 highest-leverage
// actions for the coming week.
//
// This is the "Monday morning briefing" a senior marketing advisor would give —
// not per-campaign tactics, but portfolio direction.
//
// Stored in client_settings.weekly_strategy (JSONB). The dashboard reads this
// and surfaces it to the user in the Intelligence tab.
//
// Non-blocking: never prevents campaign execution. If analysis fails, existing
// strategy_plan remains unchanged.

import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import { getRecentOutcomes } from '../optimization/outcome-tracker.js';
import { getIncrementalitySnapshot } from './incrementality.js';

export interface WeeklyStrategyAnalysis {
  week_of: string;
  portfolio_verdict: 'on_track' | 'behind' | 'ahead' | 'pivot_needed' | 'insufficient_data';
  hypothesis_still_valid: boolean;
  hypothesis_drift: string;
  top_insights: string[];
  top_actions: Array<{
    action: string;
    urgency: 'now' | 'this_week' | 'next_week';
    rationale: string;
  }>;
  budget_recommendation: string;
  creative_recommendation: string;
  regime_signal: 'normal' | 'degrading' | 'pivot_needed';
  generated_at: string;
}

interface CampaignSummary {
  name: string;
  platform: string;
  status: string;
  dailyBudgetUsd: number;
  daysRunning: number;
  avgCtr7d?: number;
  avgRoas7d?: number;
}

interface ProtocolSummary {
  type: string;
  status: string;
  title: string;
  approvalSummary?: string;
}

const SYSTEM_PROMPT = `You are the Senior Marketing Strategist of Vigmis — not a campaign manager, not a copywriter. You think at portfolio level. Your job once per week is to evaluate whether the client's strategy is working and what moves matter most in the coming week.

Be brutally honest. If results are weak, say so clearly. If the hypothesis needs updating, say so. If one platform is dragging the portfolio, name it.

Your output becomes the client's Monday morning briefing. It should be direct, actionable, and free of corporate filler.

When you detect a hypothesis to test, add it to your output. Format hypotheses as plain testable statements: "If we shift to video, CTR will improve because our audience responds to motion."`;

async function buildWeeklyContextPrompt(
  tenantId: string,
): Promise<{ prompt: string; hasEnoughData: boolean }> {
  const since7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [
    settingsResult,
    campaignsResult,
    recentProtocolsResult,
    creativesResult,
    auditSnapshotsResult,
    ga4Result,
    outcomesResult,
    incrementalityResult,
  ] = await Promise.all([
    db.from('client_settings')
      .select('strategy_plan, budget_monthly_ils, winning_patterns, goal, website_url, data_maturity_level, decision_quality_stats, hypotheses')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db.from('campaigns')
      .select('id, name, platform, status, daily_budget_usd, created_at, campaign_type')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('decision_protocols')
      .select('type, status, title, approval_summary')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('creative_jobs')
      .select('type, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10),
    // Real performance metrics from audit_log snapshots (last 7 days)
    db.from('audit_log')
      .select('payload, created_at')
      .eq('tenant_id', tenantId)
      .eq('action', 'optimization.metrics_snapshot')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false })
      .limit(70),
    // GA4 ground truth last 7 days
    db.from('ga4_daily_metrics')
      .select('date, sessions, conversions, purchase_revenue, new_users, returning_users')
      .eq('tenant_id', tenantId)
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('date', { ascending: false }),
    // Last 5 outcome measurements
    getRecentOutcomes(tenantId, 5),
    // Incrementality snapshot
    getIncrementalitySnapshot(tenantId),
  ]);

  const settings = settingsResult.data;
  const campaigns = (campaignsResult.data ?? []) as any[];
  const protocols = (recentProtocolsResult.data ?? []) as ProtocolSummary[];
  const creatives = (creativesResult.data ?? []);
  const snapshots = (auditSnapshotsResult.data ?? []);
  const ga4Rows   = (ga4Result.data ?? []);
  const outcomes  = outcomesResult;
  const incremental = incrementalityResult;

  if (!settings?.strategy_plan) {
    return { prompt: '', hasEnoughData: false };
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  if (activeCampaigns.length === 0) {
    return { prompt: '', hasEnoughData: false };
  }

  const now = Date.now();

  // Aggregate real metrics per campaign from snapshots
  const metricsPerCampaign: Record<string, { clicks: number; impressions: number; spend: number; conversions: number; revenue: number; count: number }> = {};
  for (const snap of snapshots) {
    const p = snap.payload as any;
    if (!p?.campaignId) continue;
    if (!metricsPerCampaign[p.campaignId]) {
      metricsPerCampaign[p.campaignId] = { clicks: 0, impressions: 0, spend: 0, conversions: 0, revenue: 0, count: 0 };
    }
    const m = metricsPerCampaign[p.campaignId];
    m.clicks      += p.clicks ?? 0;
    m.impressions += p.impressions ?? 0;
    m.spend       += p.spend ?? 0;
    m.conversions += p.conversions ?? 0;
    m.revenue     += p.revenue ?? 0;
    m.count++;
  }

  const campaignSummaries: CampaignSummary[] = campaigns.map(c => {
    const m = metricsPerCampaign[c.id];
    const avgCtr7d = m && m.impressions > 0 ? m.clicks / m.impressions : undefined;
    const avgRoas7d = m && m.spend > 0 && m.revenue > 0 ? m.revenue / m.spend : undefined;
    return {
      name: c.name,
      platform: c.platform,
      status: c.status,
      dailyBudgetUsd: c.daily_budget_usd,
      daysRunning: Math.floor((now - new Date(c.created_at).getTime()) / 86_400_000),
      avgCtr7d,
      avgRoas7d,
    };
  });

  const totalDailyBudget = activeCampaigns.reduce((s: number, c: any) => s + (c.daily_budget_usd ?? 0), 0);
  const totalMonthlyBudgetIls = (settings.budget_monthly_ils as number) ?? 0;
  const strategyPlan = settings.strategy_plan as any;
  const winningPatterns = (settings.winning_patterns as any) ?? null;
  const maturityLevel = (settings as any).data_maturity_level ?? 1;
  const decisionQuality = (settings as any).decision_quality_stats ?? {};
  const currentHypotheses = ((settings as any).hypotheses ?? []) as any[];

  const sections: string[] = [];

  sections.push(`ORIGINAL STRATEGY HYPOTHESIS:
Target audience: ${strategyPlan.target_audience ?? 'unknown'}
Main goal: ${strategyPlan.goal ?? (settings.goal as string) ?? 'leads'}
Strategy narrative: ${String(strategyPlan.strategy_narrative ?? '').slice(0, 600)}
Monthly budget: ₪${totalMonthlyBudgetIls} (~$${Math.round(totalMonthlyBudgetIls / 3.7)}/mo)
Website: ${(settings.website_url as string) ?? 'unknown'}
Data Maturity Level: ${maturityLevel}/5`);

  sections.push(`CURRENT PORTFOLIO STATE (last 7 days — real metrics from ad platforms):
Active daily budget: $${totalDailyBudget.toFixed(0)}/day
Campaigns running: ${activeCampaigns.length}
${campaignSummaries.map(c => {
  const ctrStr  = c.avgCtr7d  !== undefined ? ` | CTR: ${(c.avgCtr7d * 100).toFixed(2)}%` : '';
  const roasStr = c.avgRoas7d !== undefined ? ` | ROAS: ${c.avgRoas7d.toFixed(1)}×` : '';
  return `  • [${c.status.toUpperCase()}] ${c.name} (${c.platform}) — $${c.dailyBudgetUsd}/day — ${c.daysRunning} days${ctrStr}${roasStr}`;
}).join('\n')}`);

  // GA4 ground truth
  if (ga4Rows.length > 0) {
    const totalSessions   = ga4Rows.reduce((s: number, r: any) => s + (r.sessions ?? 0), 0);
    const totalConv       = ga4Rows.reduce((s: number, r: any) => s + (r.conversions ?? 0), 0);
    const totalRevenue    = ga4Rows.reduce((s: number, r: any) => s + (r.purchase_revenue ?? 0), 0);
    const totalNewUsers   = ga4Rows.reduce((s: number, r: any) => s + (r.new_users ?? 0), 0);
    sections.push(`GA4 GROUND TRUTH (last 7 days — not platform self-reported):
  Sessions: ${totalSessions.toLocaleString()} | Conversions: ${totalConv} | Revenue: $${totalRevenue.toFixed(0)}
  New users: ${totalNewUsers} | Conv rate: ${totalSessions > 0 ? ((totalConv / totalSessions) * 100).toFixed(2) : '0'}%`);
  }

  // Incrementality (Level 4+)
  if (incremental && maturityLevel >= 4) {
    sections.push(`ROAS BREAKDOWN (incrementality analysis):
  Platform self-reported ROAS: ${incremental.platform_reported_roas?.toFixed(1) ?? 'n/a'}×
  GA4 attributed ROAS: ${incremental.ga4_reported_roas.toFixed(1)}×
  Incremental ROAS (new customers only): ${incremental.incremental_roas_estimate.toFixed(1)}× (confidence: ${Math.round(incremental.confidence * 100)}%)
  Note: ${incremental.confidence_notes.slice(0, 200)}`);
  }

  if (protocols.length > 0) {
    const recentDecisions = protocols.slice(0, 5);
    sections.push(`RECENT OPTIMIZATION DECISIONS (last 5):
${recentDecisions.map(p =>
  `  • [${p.status}] ${p.type}: ${p.title}${p.approvalSummary ? ` — client: "${p.approvalSummary}"` : ''}`
).join('\n')}`);
  }

  // Outcome measurements (Decision Quality)
  if (outcomes.length > 0) {
    const measuredOutcomes = outcomes.filter(o => o.verdict !== 'insufficient_data');
    if (measuredOutcomes.length > 0) {
      sections.push(`DECISION OUTCOMES (what actually happened after our recommendations):
${measuredOutcomes.map(o => {
  const delta = o.deltaPercent !== null ? `${o.deltaPercent > 0 ? '+' : ''}${o.deltaPercent.toFixed(1)}%` : 'n/a';
  return `  • [${o.verdict.toUpperCase()}] ${o.type}: ${delta} performance change`;
}).join('\n')}`);
    }
  }

  // Decision quality (batting average)
  const qualityKeys = Object.keys(decisionQuality);
  if (qualityKeys.length > 0) {
    sections.push(`MY DECISION QUALITY (self-evaluation):
${qualityKeys.map(k => {
  const q = decisionQuality[k];
  return `  • ${k}: ${Math.round(q.batting_avg * 100)}% success rate (${q.improved}/${q.decisions} improved)`;
}).join('\n')}`);
  }

  const approvedCreatives = creatives.filter((c: any) => c.status === 'approved').length;
  const pendingCreatives  = creatives.filter((c: any) => c.status === 'pending_approval').length;
  sections.push(`CREATIVE PIPELINE:
  Approved this week: ${approvedCreatives} creatives
  Pending approval: ${pendingCreatives} creatives`);

  if (winningPatterns) {
    const types = Object.keys(winningPatterns);
    const totalPatterns = types.reduce((s: number, t: string) => s + ((winningPatterns[t] as any[])?.length ?? 0), 0);
    if (totalPatterns > 0) {
      sections.push(`LEARNING LOOP — WINNING PATTERNS:
  ${totalPatterns} approved patterns accumulated (${types.join(', ')})
  Most recent hook: "${(winningPatterns[types[0]] as any[])?.slice(-1)[0]?.openingHook ?? 'none'}"`);
    }
  }

  // Open hypotheses
  const openHypotheses = currentHypotheses.filter((h: any) => h.status === 'open');
  if (openHypotheses.length > 0) {
    sections.push(`OPEN HYPOTHESES (to validate or invalidate):
${openHypotheses.slice(0, 3).map((h: any) => `  • [${Math.round((h.confidence ?? 0) * 100)}% confidence] ${h.text}`).join('\n')}`);
  }

  const prompt = `${sections.join('\n\n')}

TASK: Produce this week's strategic portfolio analysis. Be direct. Use specific numbers. Reference the decision outcomes above when evaluating my recommendation quality.

Return ONLY valid JSON (no markdown):
{
  "portfolio_verdict": "on_track|behind|ahead|pivot_needed",
  "hypothesis_still_valid": true|false,
  "hypothesis_drift": "<empty string if still valid, or 1-2 sentences>",
  "top_insights": [
    "<insight 1 — specific, data-grounded>",
    "<insight 2>",
    "<insight 3>"
  ],
  "top_actions": [
    { "action": "<specific action>", "urgency": "now|this_week|next_week", "rationale": "<why>" },
    { "action": "<specific action>", "urgency": "now|this_week|next_week", "rationale": "<why>" },
    { "action": "<specific action>", "urgency": "now|this_week|next_week", "rationale": "<why>" }
  ],
  "budget_recommendation": "<one sentence — where to put money this week>",
  "creative_recommendation": "<one sentence — what type of creative the portfolio needs most>",
  "new_hypotheses": [
    { "text": "<testable hypothesis>", "confidence": 0.6 }
  ],
  "regime_signal": "normal|degrading|pivot_needed"
}`;

  return { prompt, hasEnoughData: true };
}

function detectRegime(snapshots7d: number[], snapshots60d: number[]): 'normal' | 'degrading' | 'pivot_needed' {
  if (snapshots7d.length < 3 || snapshots60d.length < 10) return 'normal';
  const avg7  = snapshots7d.reduce((s, v) => s + v, 0) / snapshots7d.length;
  const avg60 = snapshots60d.reduce((s, v) => s + v, 0) / snapshots60d.length;
  if (avg60 <= 0) return 'normal';
  const ratio = avg7 / avg60;
  if (ratio < 0.5)  return 'pivot_needed';
  if (ratio < 0.75) return 'degrading';
  return 'normal';
}

export async function runStrategicBrain(tenantId: string): Promise<WeeklyStrategyAnalysis | null> {
  const weekOf = new Date();
  const day = weekOf.getDay();
  weekOf.setDate(weekOf.getDate() - (day === 0 ? 6 : day - 1));
  const weekOfStr = weekOf.toISOString().slice(0, 10);

  // Regime detection: compare 7d vs 60d CTR
  const since7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [snaps7Res, snaps60Res] = await Promise.all([
    db.from('audit_log')
      .select('payload')
      .eq('tenant_id', tenantId)
      .eq('action', 'optimization.metrics_snapshot')
      .gte('created_at', since7d),
    db.from('audit_log')
      .select('payload')
      .eq('tenant_id', tenantId)
      .eq('action', 'optimization.metrics_snapshot')
      .gte('created_at', since60d)
      .lt('created_at', since7d),
  ]);

  const ctrs7d  = (snaps7Res.data  ?? []).map((r: any) => (r.payload as any)?.ctr ?? 0);
  const ctrs60d = (snaps60Res.data ?? []).map((r: any) => (r.payload as any)?.ctr ?? 0);
  const regimeSignal = detectRegime(ctrs7d, ctrs60d);

  const { prompt, hasEnoughData } = await buildWeeklyContextPrompt(tenantId);

  if (!hasEnoughData) {
    const insufficient: WeeklyStrategyAnalysis = {
      week_of: weekOfStr,
      portfolio_verdict: 'insufficient_data',
      hypothesis_still_valid: true,
      hypothesis_drift: '',
      top_insights: ['No active campaigns yet — launch campaigns to unlock weekly strategic analysis.'],
      top_actions: [{ action: 'Launch at least one campaign to start collecting data.', urgency: 'now', rationale: 'Strategic analysis requires real campaign performance data.' }],
      budget_recommendation: 'Allocate budget to your first campaign as soon as possible.',
      creative_recommendation: 'Create your first creative asset to get campaigns live.',
      regime_signal: 'normal',
      generated_at: new Date().toISOString(),
    };
    await persistAnalysis(tenantId, insufficient);
    return insufficient;
  }

  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      options: { maxTokens: 1000, temperature: 0.3 },
    });

    const rawJson = res.output.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Override regime from our own detection if worse than AI's
    const aiRegime = parsed.regime_signal ?? 'normal';
    const finalRegime = (regimeSignal === 'degrading' && aiRegime === 'normal') ? 'degrading' : aiRegime;

    const analysis: WeeklyStrategyAnalysis = {
      week_of: weekOfStr,
      portfolio_verdict: finalRegime === 'degrading' ? 'behind' : (parsed.portfolio_verdict ?? 'insufficient_data'),
      hypothesis_still_valid: parsed.hypothesis_still_valid ?? true,
      hypothesis_drift: parsed.hypothesis_drift ?? '',
      top_insights: Array.isArray(parsed.top_insights) ? parsed.top_insights.slice(0, 3) : [],
      top_actions: Array.isArray(parsed.top_actions) ? parsed.top_actions.slice(0, 3) : [],
      budget_recommendation: parsed.budget_recommendation ?? '',
      creative_recommendation: parsed.creative_recommendation ?? '',
      regime_signal: finalRegime,
      generated_at: new Date().toISOString(),
    };

    // Persist analysis
    await persistAnalysis(tenantId, analysis);

    // Update hypotheses from AI output
    if (process.env.ENABLE_HYPOTHESES !== 'false' && Array.isArray(parsed.new_hypotheses) && parsed.new_hypotheses.length > 0) {
      await updateHypotheses(tenantId, parsed.new_hypotheses);
    }

    console.log(`[strategic-brain] tenant=${tenantId} verdict=${analysis.portfolio_verdict} regime=${analysis.regime_signal} week=${weekOfStr}`);
    return analysis;

  } catch (err) {
    console.error('[strategic-brain] analysis failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function persistAnalysis(tenantId: string, analysis: WeeklyStrategyAnalysis): Promise<void> {
  await db
    .from('client_settings')
    .update({ weekly_strategy: analysis as any, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
}

async function updateHypotheses(tenantId: string, newHypotheses: Array<{ text: string; confidence: number }>): Promise<void> {
  const { data } = await db
    .from('client_settings')
    .select('hypotheses')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const existing = ((data as any)?.hypotheses ?? []) as any[];

  // Deduplicate by text similarity (simple: exact match on first 80 chars)
  const existingTexts = new Set(existing.map((h: any) => String(h.text).slice(0, 80)));

  const toAdd = newHypotheses
    .filter(h => !existingTexts.has(h.text.slice(0, 80)))
    .map(h => ({
      id: `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: h.text,
      confidence: h.confidence ?? 0.5,
      evidence: [] as string[],
      status: 'open',
      createdAt: new Date().toISOString(),
      linkedTestId: null,
    }));

  if (!toAdd.length) return;

  const updated = [...existing, ...toAdd].slice(-10); // max 10 hypotheses
  await db.from('client_settings')
    .update({ hypotheses: updated, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
}

export async function getWeeklyStrategy(tenantId: string): Promise<WeeklyStrategyAnalysis | null> {
  const { data } = await db
    .from('client_settings')
    .select('weekly_strategy')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return (data as any)?.weekly_strategy as WeeklyStrategyAnalysis ?? null;
}

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

export interface WeeklyStrategyAnalysis {
  week_of: string;              // ISO date of the Monday this covers
  portfolio_verdict: 'on_track' | 'behind' | 'ahead' | 'pivot_needed' | 'insufficient_data';
  hypothesis_still_valid: boolean;
  hypothesis_drift: string;     // empty string if still valid
  top_insights: string[];       // 3 most important observations from the week
  top_actions: Array<{
    action: string;
    urgency: 'now' | 'this_week' | 'next_week';
    rationale: string;
  }>;
  budget_recommendation: string;
  creative_recommendation: string;
  generated_at: string;
}

interface CampaignSummary {
  name: string;
  platform: string;
  status: string;
  dailyBudgetUsd: number;
  daysRunning: number;
}

interface ProtocolSummary {
  type: string;
  status: string;
  title: string;
  approvalSummary?: string;
}

const SYSTEM_PROMPT = `You are the Senior Marketing Strategist of Vigmis — not a campaign manager, not a copywriter. You think at portfolio level. Your job once per week is to evaluate whether the client's strategy is working and what moves matter most in the coming week.

Be brutally honest. If results are weak, say so clearly. If the hypothesis needs updating, say so. If one platform is dragging the portfolio, name it.

Your output becomes the client's Monday morning briefing. It should be direct, actionable, and free of corporate filler.`;

async function buildWeeklyContextPrompt(
  tenantId: string,
): Promise<{ prompt: string; hasEnoughData: boolean }> {
  // Fetch all the data we need in parallel
  const [settingsResult, campaignsResult, recentProtocolsResult, creativesResult] = await Promise.all([
    db.from('client_settings').select('strategy_plan, budget_monthly_ils, winning_patterns, goal, website_url').eq('tenant_id', tenantId).maybeSingle(),
    db.from('campaigns').select('name, platform, status, daily_budget_usd, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
    db.from('optimization_protocols').select('type, status, title, approval_summary').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
    db.from('creative_jobs').select('type, status, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
  ]);

  const settings = settingsResult.data;
  const campaigns = (campaignsResult.data ?? []) as Array<{
    name: string; platform: string; status: string; daily_budget_usd: number; created_at: string;
  }>;
  const protocols = (recentProtocolsResult.data ?? []) as ProtocolSummary[];
  const creatives = (creativesResult.data ?? []);

  if (!settings?.strategy_plan) {
    return { prompt: '', hasEnoughData: false };
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  if (activeCampaigns.length === 0) {
    return { prompt: '', hasEnoughData: false };
  }

  const now = Date.now();
  const campaignSummaries: CampaignSummary[] = campaigns.map(c => ({
    name: c.name,
    platform: c.platform,
    status: c.status,
    dailyBudgetUsd: c.daily_budget_usd,
    daysRunning: Math.floor((now - new Date(c.created_at).getTime()) / 86_400_000),
  }));

  const totalDailyBudget = activeCampaigns.reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);
  const totalMonthlyBudgetIls = (settings.budget_monthly_ils as number) ?? 0;

  const strategyPlan = settings.strategy_plan as any;
  const winningPatterns = (settings.winning_patterns as any) ?? null;

  // Build the prompt sections
  const sections: string[] = [];

  sections.push(`ORIGINAL STRATEGY HYPOTHESIS:
Target audience: ${strategyPlan.target_audience ?? 'unknown'}
Main goal: ${strategyPlan.goal ?? (settings.goal as string) ?? 'leads'}
Strategy narrative: ${String(strategyPlan.strategy_narrative ?? '').slice(0, 600)}
Monthly budget: ₪${totalMonthlyBudgetIls} (~$${Math.round(totalMonthlyBudgetIls / 3.7)}/mo)
Website: ${(settings.website_url as string) ?? 'unknown'}`);

  sections.push(`CURRENT PORTFOLIO STATE:
Active daily budget: $${totalDailyBudget.toFixed(0)}/day
Campaigns running: ${activeCampaigns.length}
${campaignSummaries.map(c =>
  `  • [${c.status.toUpperCase()}] ${c.name} (${c.platform}) — $${c.dailyBudgetUsd}/day — ${c.daysRunning} days running`
).join('\n')}`);

  if (protocols.length > 0) {
    const recentDecisions = protocols.slice(0, 5);
    sections.push(`RECENT OPTIMIZATION DECISIONS (last 5):
${recentDecisions.map(p =>
  `  • [${p.status}] ${p.type}: ${p.title}${p.approvalSummary ? ` — client note: "${p.approvalSummary}"` : ''}`
).join('\n')}`);
  }

  const approvedCreatives = creatives.filter(c => c.status === 'approved').length;
  const pendingCreatives = creatives.filter(c => c.status === 'pending_approval').length;
  sections.push(`CREATIVE PIPELINE:
  Approved this week: ${approvedCreatives} creatives
  Pending approval: ${pendingCreatives} creatives`);

  if (winningPatterns) {
    const types = Object.keys(winningPatterns);
    const totalPatterns = types.reduce((s, t) => s + (winningPatterns[t]?.length ?? 0), 0);
    if (totalPatterns > 0) {
      sections.push(`LEARNING LOOP — WINNING PATTERNS:
  ${totalPatterns} approved patterns accumulated (${types.join(', ')})
  Most recent hook: "${winningPatterns[types[0]]?.slice(-1)[0]?.openingHook ?? 'none'}"`);
    }
  }

  const prompt = `${sections.join('\n\n')}

TASK: Produce this week's strategic portfolio analysis. Be direct. Use specific numbers from the data above. No generic advice.

Return ONLY valid JSON (no markdown):
{
  "portfolio_verdict": "on_track|behind|ahead|pivot_needed",
  "hypothesis_still_valid": true|false,
  "hypothesis_drift": "<empty string if still valid, or 1-2 sentences explaining the drift>",
  "top_insights": [
    "<insight 1 — specific, data-grounded>",
    "<insight 2>",
    "<insight 3>"
  ],
  "top_actions": [
    { "action": "<specific action>", "urgency": "now|this_week|next_week", "rationale": "<why this week, not later>" },
    { "action": "<specific action>", "urgency": "now|this_week|next_week", "rationale": "<why>" },
    { "action": "<specific action>", "urgency": "now|this_week|next_week", "rationale": "<why>" }
  ],
  "budget_recommendation": "<one sentence — where to put money this week>",
  "creative_recommendation": "<one sentence — what type of creative the portfolio needs most right now>"
}`;

  return { prompt, hasEnoughData: true };
}

export async function runStrategicBrain(tenantId: string): Promise<WeeklyStrategyAnalysis | null> {
  const weekOf = new Date();
  // Anchor to Monday
  const day = weekOf.getDay();
  weekOf.setDate(weekOf.getDate() - (day === 0 ? 6 : day - 1));
  const weekOfStr = weekOf.toISOString().slice(0, 10);

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
      options: { maxTokens: 800, temperature: 0.3 },
    });

    const rawJson = res.output.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    const analysis: WeeklyStrategyAnalysis = {
      week_of: weekOfStr,
      portfolio_verdict: parsed.portfolio_verdict ?? 'insufficient_data',
      hypothesis_still_valid: parsed.hypothesis_still_valid ?? true,
      hypothesis_drift: parsed.hypothesis_drift ?? '',
      top_insights: Array.isArray(parsed.top_insights) ? parsed.top_insights.slice(0, 3) : [],
      top_actions: Array.isArray(parsed.top_actions) ? parsed.top_actions.slice(0, 3) : [],
      budget_recommendation: parsed.budget_recommendation ?? '',
      creative_recommendation: parsed.creative_recommendation ?? '',
      generated_at: new Date().toISOString(),
    };

    await persistAnalysis(tenantId, analysis);
    console.log(`[strategic-brain] tenant=${tenantId} verdict=${analysis.portfolio_verdict} week=${weekOfStr}`);
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

// Fetch the latest weekly analysis for the intelligence tab dashboard
export async function getWeeklyStrategy(tenantId: string): Promise<WeeklyStrategyAnalysis | null> {
  const { data } = await db
    .from('client_settings')
    .select('weekly_strategy')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return (data as any)?.weekly_strategy as WeeklyStrategyAnalysis ?? null;
}

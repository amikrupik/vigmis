// Optimization Narrative — generates contextual, intelligent explanations for
// optimization decisions. Turns rule-engine reason strings ("CTR 0.8% below 1%
// benchmark") into senior account manager-level briefings that explain what
// happened, why it matters for THIS business, and what to expect from the
// recommended action.
//
// Used by:
//   - engine.ts when creating Decision Protocols
//   - briefings.ts when assembling the executive narrative

import { route } from '@vigmis/ai-router';

export interface OptimizationNarrativeCtx {
  campaignName: string;
  platform: string;
  campaignType: string;
  actionType: string;          // scale_up | scale_down | needs_creative | needs_targeting_review | pause | stagnation
  ruleReason: string;          // raw string from rules engine
  metrics: {
    clicks: number;
    impressions: number;
    ctr: number;
    spend: number;
    dailyBudgetUsd: number;
    daysRunning: number;
    conversions?: number;
    revenue?: number;
    attributionSource?: string;
  };
  // Three-layer ROAS: the honest picture
  roasTriple?: {
    platformReported: number | null;  // what Meta/Google claims
    ga4Attributed: number;            // GA4 single-touch (more honest)
    incremental: number;              // new customers only (most honest)
    confidence: number;               // 0-1 confidence in incremental figure
  };
  proposedChange?: string;
  businessGoal?: string;
  strategyNarrative?: string;
  targetAudience?: string;
}

const ACTION_INTENT: Record<string, string> = {
  scale_up:              'budget increase — capitalize on strong performance',
  scale_down:            'budget reduction — preserve efficiency while addressing underperformance',
  needs_creative:        'creative refresh — address performance fatigue with new assets',
  needs_targeting_review: 'targeting review — fix audience or keyword mismatch before wasting more budget',
  pause:                 'campaign pause — cut losses on a campaign that is not delivering',
  stagnation:            'honest performance assessment — the campaign has not improved after sustained optimization',
};

export async function buildOptimizationNarrative(ctx: OptimizationNarrativeCtx): Promise<string> {
  const ctrPct = (ctx.metrics.ctr * 100).toFixed(2);
  const roas = ctx.metrics.revenue && ctx.metrics.spend > 0
    ? (ctx.metrics.revenue / ctx.metrics.spend).toFixed(1)
    : null;

  const roasLines: string[] = [];
  if (ctx.roasTriple) {
    const r = ctx.roasTriple;
    if (r.platformReported !== null && r.platformReported !== undefined) {
      roasLines.push(`ROAS — Platform self-reported: ${r.platformReported.toFixed(1)}× | GA4 attributed: ${r.ga4Attributed.toFixed(1)}× | Incremental (new customers): ${r.incremental.toFixed(1)}× [confidence: ${Math.round(r.confidence * 100)}%]`);
    } else {
      roasLines.push(`ROAS — GA4 attributed: ${r.ga4Attributed.toFixed(1)}× | Incremental (new customers): ${r.incremental.toFixed(1)}× [confidence: ${Math.round(r.confidence * 100)}%]`);
    }
  }

  const metricsBlock = [
    `Platform: ${ctx.platform} (${ctx.campaignType})`,
    `Running: ${ctx.metrics.daysRunning} days`,
    `Clicks: ${ctx.metrics.clicks} | Impressions: ${ctx.metrics.impressions.toLocaleString()} | CTR: ${ctrPct}%`,
    `Spend: $${ctx.metrics.spend.toFixed(2)} | Daily budget: $${ctx.metrics.dailyBudgetUsd}/day`,
    ctx.metrics.conversions !== undefined ? `Conversions: ${ctx.metrics.conversions}${roas && !ctx.roasTriple ? ` | ROAS: ${roas}×` : ''}${ctx.metrics.attributionSource === 'ga4' ? ' (GA4 ground truth)' : ' (platform reported)'}` : '',
    ...roasLines,
  ].filter(Boolean).join('\n');

  try {
    const res = await route({
      task: 'optimization_decision',
      prompt: `You are a senior performance marketing account manager. Write a decision protocol recommendation for a client.

ACTION TYPE: ${ctx.actionType} — ${ACTION_INTENT[ctx.actionType] ?? ctx.actionType}
RULE TRIGGER: ${ctx.ruleReason}

CAMPAIGN: "${ctx.campaignName}"
${metricsBlock}
${ctx.proposedChange ? `PROPOSED CHANGE: ${ctx.proposedChange}` : ''}
${ctx.businessGoal ? `CLIENT GOAL: ${ctx.businessGoal}` : ''}
${ctx.targetAudience ? `TARGET AUDIENCE: ${ctx.targetAudience}` : ''}
${ctx.strategyNarrative ? `STRATEGY CONTEXT (first paragraph): ${ctx.strategyNarrative.slice(0, 400)}` : ''}

Write 2–3 tight paragraphs:
1. What is happening in the data and WHY it matters for this specific business (not a generic explanation — reference the actual numbers and the business goal)
2. What Vigmis recommends and the specific reasoning behind this recommendation (including what the data signals, what the likely root cause is, and what the expected outcome of the action is)
3. What the client should watch for next, and what would trigger the next decision

Rules:
- Be honest — if performance is weak, say so directly
- Be specific — reference actual numbers, not generic percentages
- Be contextual — connect the metrics to the business goal and audience
- Do NOT be generic or use filler phrases like "great performance" or "monitoring closely"
- Do NOT mention Vigmis in the third person as a product — write as if you ARE the marketing manager
- Match client's language preference if known, default to English`,
      systemPrompt: 'You are a senior performance marketing account manager writing to a business owner. Be direct, specific, honest, and commercially sharp. No marketing speak.',
      options: { maxTokens: 500, temperature: 0.3 },
    });
    return res.output.trim();
  } catch {
    return ctx.ruleReason;
  }
}

export interface BriefingNarrativeCtx {
  lookbackDays: number;
  activeCampaigns: number;
  totalSessions: number;
  totalRevenue: number;
  scaleUps: number;
  scaleDowns: number;
  pauses: number;
  pendingDecisions: number;
  businessGoal?: string;
  topCampaignName?: string;
  topCampaignPlatform?: string;
}

export async function buildBriefingNarrative(ctx: BriefingNarrativeCtx): Promise<string> {
  if (ctx.activeCampaigns === 0 && ctx.totalSessions === 0) return '';

  const period = ctx.lookbackDays === 1 ? 'yesterday' : `the last ${ctx.lookbackDays} days`;

  try {
    const res = await route({
      task: 'optimization_decision',
      prompt: `You are a senior marketing account manager writing a brief executive summary for a business owner's performance digest.

DATA FOR ${period.toUpperCase()}:
- Active campaigns: ${ctx.activeCampaigns}
- Website sessions: ${ctx.totalSessions.toLocaleString()}
- Revenue attributed: $${ctx.totalRevenue.toFixed(0)}
- Optimization actions taken: ${ctx.scaleUps} scale-ups, ${ctx.scaleDowns} scale-downs, ${ctx.pauses} pauses
- Decisions awaiting client: ${ctx.pendingDecisions}
${ctx.businessGoal ? `- Client goal: ${ctx.businessGoal}` : ''}
${ctx.topCampaignName ? `- Top campaign: "${ctx.topCampaignName}" on ${ctx.topCampaignPlatform}` : ''}

Write 1–2 sentences (max 3). State the most important signal from the data and whether it's positive, neutral, or requires attention. Be direct and specific — no filler. Reference actual numbers.`,
      systemPrompt: 'You are a senior marketing account manager. Be concise and direct. Write for a busy business owner who reads the first two lines and decides whether to open the full report.',
      options: { maxTokens: 120, temperature: 0.2 },
    });
    return res.output.trim();
  } catch {
    return '';
  }
}

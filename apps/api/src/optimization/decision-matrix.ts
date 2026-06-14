// Decision Matrix — enriches every optimization protocol with 3 options.
// Instead of "do X", the client sees: Conservative / Balanced / Aggressive.
// This removes the binary approve/reject and gives clients real agency.

import type { OptimizationAction } from './rules.js';
import type { CampaignMetrics } from './rules.js';
import type { PortfolioRole } from './portfolio.js';
import type { QualityGateResult } from './quality-gate.js';

export interface DecisionOption {
  label: 'Conservative' | 'Balanced' | 'Aggressive';
  description: string;
  expectedOutcome: string;
  riskNote: string;
  budgetChangePct: number | null; // null = no budget change
}

export interface DecisionMatrix {
  options: [DecisionOption, DecisionOption, DecisionOption];
  // The index of the option Vigmis recommends (0=Conservative, 1=Balanced, 2=Aggressive)
  recommendedIndex: 0 | 1 | 2;
  confidenceNote: string;
  portfolioNote: string;
}

function pct(n: number): string {
  return n > 0 ? `+${n}%` : `${n}%`;
}

export function buildDecisionMatrix(
  action: OptimizationAction,
  metrics: CampaignMetrics,
  portfolioRole: PortfolioRole,
  gate: QualityGateResult,
): DecisionMatrix {
  const ctrPct = metrics.impressions > 0
    ? ((metrics.clicks / metrics.impressions) * 100).toFixed(2)
    : '—';

  const portfolioNote = (() => {
    switch (portfolioRole) {
      case 'cash_cow':    return `This campaign is a proven performer (ROAS-positive). Treat budget changes conservatively — protect what's working.`;
      case 'retargeting': return `Retargeting campaign — CPA is the primary success metric, not CTR. Scale based on CPA efficiency, not click volume.`;
      case 'learning':    return `Campaign is in the learning phase. Algorithm decisions made now affect the entire optimization trajectory.`;
      case 'awareness':   return `Awareness campaign — ROAS and CTR are not the right measures. Judge by CPM and reach efficiency.`;
      case 'defense':     return `Branded defense campaign — impression share is the only metric that matters here.`;
    }
  })();

  const confidenceNote = gate.confidence === 'high'
    ? `High confidence — ${metrics.clicks} clicks across ${metrics.impressions.toLocaleString()} impressions.`
    : gate.confidence === 'medium'
    ? `Moderate confidence — ${gate.reason}`
    : `Low confidence — ${gate.reason} The Balanced option is not recommended at this data volume.`;

  switch (action.type) {
    case 'scale_up': {
      const factor = 'factor' in action ? action.factor : 1.25;
      const aggFactor = Math.min(factor * 1.4, 1.50);
      const conFactor = Math.max(factor * 0.5, 1.08);
      return {
        options: [
          {
            label: 'Conservative',
            description: `Increase budget by ${pct(Math.round((conFactor - 1) * 100))} ($${(metrics.dailyBudgetUsd * conFactor).toFixed(0)}/day). Small test — preserve current performance while probing higher volume.`,
            expectedOutcome: 'Marginal volume increase with minimal risk to CPM/CPC stability. Best choice if confidence is medium.',
            riskNote: 'Low. Small change; easy to reverse.',
            budgetChangePct: Math.round((conFactor - 1) * 100),
          },
          {
            label: 'Balanced',
            description: `Increase budget by ${pct(Math.round((factor - 1) * 100))} ($${(metrics.dailyBudgetUsd * factor).toFixed(0)}/day). Standard scale based on current CTR (${ctrPct}%) performance signal.`,
            expectedOutcome: 'Proportional volume increase. Expected to maintain current CPC/CPM range for 3–5 days before algorithm re-optimizes.',
            riskNote: 'Medium. A budget increase can shift the algorithm\'s bid strategy.',
            budgetChangePct: Math.round((factor - 1) * 100),
          },
          {
            label: 'Aggressive',
            description: `Increase budget by ${pct(Math.round((aggFactor - 1) * 100))} ($${(metrics.dailyBudgetUsd * aggFactor).toFixed(0)}/day). Maximum capture while performance is strong.`,
            expectedOutcome: 'High volume capture. Risk of temporary CPC increase as the algorithm expands to less-targeted inventory.',
            riskNote: 'High. Large budget jumps can trigger a new learning phase.',
            budgetChangePct: Math.round((aggFactor - 1) * 100),
          },
        ],
        recommendedIndex: gate.confidence === 'high' ? 1 : 0,
        confidenceNote,
        portfolioNote,
      };
    }

    case 'scale_down': {
      const factor = 'factor' in action ? action.factor : 0.80;
      const conFactor = Math.max(factor + 0.08, 0.90);
      const aggFactor = Math.max(factor - 0.08, 0.60);
      return {
        options: [
          {
            label: 'Conservative',
            description: `Reduce budget by ${pct(Math.round((conFactor - 1) * 100))} ($${(metrics.dailyBudgetUsd * conFactor).toFixed(0)}/day). Small trim — test whether efficiency improves with less inventory pressure.`,
            expectedOutcome: 'Moderate spend reduction. Likely to stabilize CTR by removing low-quality inventory. Monitor 48h.',
            riskNote: 'Low. Small change; performance impact is reversible.',
            budgetChangePct: Math.round((conFactor - 1) * 100),
          },
          {
            label: 'Balanced',
            description: `Reduce budget by ${pct(Math.round((factor - 1) * 100))} ($${(metrics.dailyBudgetUsd * factor).toFixed(0)}/day). Standard reduction based on current performance signal.`,
            expectedOutcome: 'Clear spend reduction. Concentrates budget on higher-quality inventory. Expected CTR improvement in 3–5 days.',
            riskNote: 'Medium. Could trigger a short learning phase on some platforms.',
            budgetChangePct: Math.round((factor - 1) * 100),
          },
          {
            label: 'Aggressive',
            description: `Reduce budget by ${pct(Math.round((aggFactor - 1) * 100))} ($${(metrics.dailyBudgetUsd * aggFactor).toFixed(0)}/day). Deep cut — force a quality-over-quantity mode.`,
            expectedOutcome: 'Significant spend reduction. High CTR improvement expected but at lower volume. Better unit economics, lower reach.',
            riskNote: 'High. Large reduction may shrink audience pools and increase CPC.',
            budgetChangePct: Math.round((aggFactor - 1) * 100),
          },
        ],
        recommendedIndex: gate.confidence === 'high' ? 1 : 0,
        confidenceNote,
        portfolioNote,
      };
    }

    case 'pause': {
      return {
        options: [
          {
            label: 'Conservative',
            description: `Reduce budget by 40% ($${(metrics.dailyBudgetUsd * 0.60).toFixed(0)}/day) instead of pausing. Keeps the campaign alive at minimum spend while addressing the underlying issue.`,
            expectedOutcome: 'Spend drops significantly but the campaign continues collecting data. Algorithm retains its optimization history.',
            riskNote: 'Low. Preserves campaign history; avoids full learning reset.',
            budgetChangePct: -40,
          },
          {
            label: 'Balanced',
            description: `Pause the campaign for 7 days. Use the pause to address the root cause (creative, landing page, or targeting), then resume with a revised approach.`,
            expectedOutcome: 'Zero spend during the pause. Campaign resumes from scratch if paused longer than the platform\'s memory window (~7 days).',
            riskNote: 'Medium. After 7 days, the algorithm partially resets and re-enters learning.',
            budgetChangePct: null,
          },
          {
            label: 'Aggressive',
            description: `Pause permanently and redirect the budget to a better-performing campaign or platform.`,
            expectedOutcome: 'Immediate spend stop. Campaign history preserved but optimization restarts if resumed later.',
            riskNote: 'High. Budget reallocation affects other campaigns\' algorithm signals.',
            budgetChangePct: null,
          },
        ],
        recommendedIndex: 1,
        confidenceNote,
        portfolioNote,
      };
    }

    default: {
      // no_action, needs_creative, needs_targeting_review — no budget matrix needed
      return {
        options: [
          { label: 'Conservative', description: 'Monitor for 48 hours before taking any action.', expectedOutcome: 'No immediate spend change.', riskNote: 'None.', budgetChangePct: null },
          { label: 'Balanced', description: 'Implement the recommended change now.', expectedOutcome: 'Addresses the issue promptly.', riskNote: 'Low.', budgetChangePct: null },
          { label: 'Aggressive', description: 'Implement the change and run an A/B test to validate.', expectedOutcome: 'Faster validation cycle.', riskNote: 'Medium.', budgetChangePct: null },
        ],
        recommendedIndex: 1,
        confidenceNote,
        portfolioNote,
      };
    }
  }
}

// Format the 3-option matrix as the recommendation text block for a Decision Protocol.
export function formatDecisionMatrixForProtocol(matrix: DecisionMatrix): string {
  const { options, recommendedIndex, confidenceNote, portfolioNote } = matrix;
  const lines: string[] = [
    '',
    '─────────────────────────────────',
    `📊 PORTFOLIO NOTE: ${portfolioNote}`,
    `📈 DATA CONFIDENCE: ${confidenceNote}`,
    '',
    '─── YOUR OPTIONS ───',
    '',
  ];

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const isRecommended = i === recommendedIndex;
    lines.push(`${isRecommended ? '★ ' : '  '}Option ${i + 1} — ${opt.label}${isRecommended ? ' (Vigmis recommends)' : ''}`);
    lines.push(`  ${opt.description}`);
    lines.push(`  Expected: ${opt.expectedOutcome}`);
    lines.push(`  Risk: ${opt.riskNote}`);
    if (opt.budgetChangePct !== null) {
      lines.push(`  Budget impact: ${opt.budgetChangePct > 0 ? '+' : ''}${opt.budgetChangePct}%`);
    }
    lines.push('');
  }

  lines.push('Reply with "Option 1", "Option 2", or "Option 3" — or ask for more context before deciding.');

  return lines.join('\n');
}

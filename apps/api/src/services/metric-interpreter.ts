// Metric Interpreter — context-aware reading of campaign metrics.
//
// A real marketing manager doesn't say "frequency=4 is bad". They say
// "frequency=4 in retargeting is fine, in prospecting you're burning out the
// creative". The threshold is context-dependent. This module encodes the
// context so the engine can interpret values correctly.
//
// Used by:
//   - Optimization engine (when recommending actions)
//   - Chat (when the user asks "is this CTR good?")
//   - Briefings (when describing performance to the customer)

export type Verdict = 'excellent' | 'good' | 'normal' | 'concerning' | 'critical';

export type CampaignType =
  | 'prospecting'
  | 'retargeting'
  | 'brand_awareness'
  | 'search'
  | 'shopping';

export type FunnelStage = 'awareness' | 'consideration' | 'conversion';

export type Category =
  | 'ecommerce'
  | 'lead_gen'
  | 'saas'
  | 'local_service'
  | 'b2b_premium';

export interface MetricContext {
  metric: string;
  value: number;
  campaignType?: CampaignType;
  funnelStage?: FunnelStage;
  category?: Category;
  daysRunning?: number;
  spendUsd?: number;
}

export interface Interpretation {
  verdict: Verdict;
  headline: string;            // one-sentence reading
  explanation: string;          // why this verdict
  action_suggestion: string;    // what to do next
  comparable_benchmark: string; // "vs ~2% typical for prospecting"
}

// ─── Bands ───────────────────────────────────────────────────────────────────
// Tuned by industry experience. Bands are EXCELLENT > GOOD > NORMAL > CONCERNING > CRITICAL.
// For "lower is better" metrics (CPC, CPA, frequency in prospecting), the order is reversed.

interface Band {
  excellent?: [number, number]; // inclusive range
  good?: [number, number];
  normal?: [number, number];
  concerning?: [number, number];
  critical?: [number, number];
  higherIsBetter: boolean;
}

interface MetricRules {
  default: Band;
  byContext?: Partial<Record<CampaignType, Band>>;
  byCategory?: Partial<Record<Category, Band>>;
}

const RULES: Record<string, MetricRules> = {
  // CTR — higher is better
  ctr: {
    default: {
      higherIsBetter: true,
      excellent: [0.05, 1],
      good: [0.025, 0.05],
      normal: [0.01, 0.025],
      concerning: [0.005, 0.01],
      critical: [0, 0.005],
    },
    byContext: {
      search: {
        higherIsBetter: true,
        excellent: [0.08, 1],
        good: [0.04, 0.08],
        normal: [0.02, 0.04],
        concerning: [0.01, 0.02],
        critical: [0, 0.01],
      },
      retargeting: {
        higherIsBetter: true,
        excellent: [0.06, 1],
        good: [0.03, 0.06],
        normal: [0.015, 0.03],
        concerning: [0.008, 0.015],
        critical: [0, 0.008],
      },
      brand_awareness: {
        higherIsBetter: true,
        excellent: [0.02, 1],
        good: [0.01, 0.02],
        normal: [0.005, 0.01],
        concerning: [0.002, 0.005],
        critical: [0, 0.002],
      },
    },
  },

  // Frequency — context-dependent direction
  // In retargeting: 3-5 = good (people need reminders)
  // In prospecting: 3+ = burnout
  frequency: {
    default: {
      higherIsBetter: false,
      excellent: [1, 1.8],
      good: [1.8, 2.5],
      normal: [2.5, 3.5],
      concerning: [3.5, 5],
      critical: [5, 100],
    },
    byContext: {
      retargeting: {
        higherIsBetter: true,
        excellent: [3, 6],
        good: [2, 3],
        normal: [1.5, 2],
        concerning: [1, 1.5],
        critical: [0, 1],
      },
      brand_awareness: {
        higherIsBetter: false,
        excellent: [1, 2.5],
        good: [2.5, 4],
        normal: [4, 6],
        concerning: [6, 8],
        critical: [8, 100],
      },
    },
  },

  // Hook rate (3-second view rate for video) — higher is better
  hook_rate: {
    default: {
      higherIsBetter: true,
      excellent: [0.35, 1],
      good: [0.25, 0.35],
      normal: [0.15, 0.25],
      concerning: [0.08, 0.15],
      critical: [0, 0.08],
    },
  },

  // Completion rate (% who watched to end) — higher is better
  completion_rate: {
    default: {
      higherIsBetter: true,
      excellent: [0.4, 1],
      good: [0.25, 0.4],
      normal: [0.15, 0.25],
      concerning: [0.08, 0.15],
      critical: [0, 0.08],
    },
  },

  // ROAS — higher is better, varies wildly by category
  roas: {
    default: {
      higherIsBetter: true,
      excellent: [4, 1000],
      good: [2.5, 4],
      normal: [1.5, 2.5],
      concerning: [1, 1.5],
      critical: [0, 1],
    },
    byCategory: {
      ecommerce: {
        higherIsBetter: true,
        excellent: [4, 1000],
        good: [2.5, 4],
        normal: [1.8, 2.5],
        concerning: [1.2, 1.8],
        critical: [0, 1.2],
      },
      b2b_premium: {
        higherIsBetter: true,
        excellent: [8, 1000],
        good: [4, 8],
        normal: [2, 4],
        concerning: [1.2, 2],
        critical: [0, 1.2],
      },
    },
  },

  // CPA — lower is better, highly category dependent
  cpa: {
    default: {
      higherIsBetter: false,
      excellent: [0, 20],
      good: [20, 50],
      normal: [50, 100],
      concerning: [100, 200],
      critical: [200, 100000],
    },
    byCategory: {
      lead_gen: {
        higherIsBetter: false,
        excellent: [0, 15],
        good: [15, 40],
        normal: [40, 80],
        concerning: [80, 150],
        critical: [150, 100000],
      },
      saas: {
        higherIsBetter: false,
        excellent: [0, 50],
        good: [50, 150],
        normal: [150, 400],
        concerning: [400, 800],
        critical: [800, 100000],
      },
      b2b_premium: {
        higherIsBetter: false,
        excellent: [0, 200],
        good: [200, 600],
        normal: [600, 1500],
        concerning: [1500, 4000],
        critical: [4000, 100000],
      },
    },
  },
};

// ─── Verdict computation ─────────────────────────────────────────────────────

function pickBand(metric: string, ctx: MetricContext): Band | null {
  const rules = RULES[metric];
  if (!rules) return null;
  if (ctx.campaignType && rules.byContext?.[ctx.campaignType]) {
    return rules.byContext[ctx.campaignType]!;
  }
  if (ctx.category && rules.byCategory?.[ctx.category]) {
    return rules.byCategory[ctx.category]!;
  }
  return rules.default;
}

function inBand(value: number, range?: [number, number]): boolean {
  if (!range) return false;
  return value >= range[0] && value < range[1];
}

function resolveVerdict(band: Band, value: number): Verdict {
  if (inBand(value, band.excellent)) return 'excellent';
  if (inBand(value, band.good)) return 'good';
  if (inBand(value, band.normal)) return 'normal';
  if (inBand(value, band.concerning)) return 'concerning';
  if (inBand(value, band.critical)) return 'critical';
  // Default by direction
  if (band.higherIsBetter) {
    if (band.excellent && value >= band.excellent[1]) return 'excellent';
    return 'critical';
  } else {
    if (band.excellent && value <= band.excellent[1]) return 'excellent';
    return 'critical';
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function interpret(ctx: MetricContext): Interpretation {
  const band = pickBand(ctx.metric, ctx);
  if (!band) {
    return {
      verdict: 'normal',
      headline: `${ctx.metric} = ${formatValue(ctx.metric, ctx.value)}`,
      explanation: 'No interpretation rules configured for this metric.',
      action_suggestion: 'No action.',
      comparable_benchmark: '',
    };
  }
  const verdict = resolveVerdict(band, ctx.value);
  const formatted = formatValue(ctx.metric, ctx.value);

  return {
    verdict,
    headline: buildHeadline(ctx, verdict, formatted),
    explanation: buildExplanation(ctx, verdict, band),
    action_suggestion: buildAction(ctx, verdict),
    comparable_benchmark: buildBenchmark(band, ctx),
  };
}

function formatValue(metric: string, v: number): string {
  if (metric === 'ctr' || metric === 'hook_rate' || metric === 'completion_rate') {
    return `${(v * 100).toFixed(2)}%`;
  }
  if (metric === 'cpa' || metric === 'cpc') return `$${v.toFixed(2)}`;
  if (metric === 'roas') return `${v.toFixed(1)}×`;
  if (metric === 'frequency') return v.toFixed(2);
  return v.toLocaleString();
}

function buildHeadline(ctx: MetricContext, verdict: Verdict, formatted: string): string {
  const labels: Record<Verdict, string> = {
    excellent: 'Excellent',
    good: 'Good',
    normal: 'In normal range',
    concerning: 'Concerning',
    critical: 'Critical',
  };
  const cmp = ctx.campaignType ? ` for ${ctx.campaignType}` : '';
  return `${ctx.metric} = ${formatted} — ${labels[verdict]}${cmp}`;
}

function buildExplanation(ctx: MetricContext, verdict: Verdict, band: Band): string {
  // Specific contextual readings for popular combinations
  if (ctx.metric === 'frequency' && ctx.campaignType === 'retargeting' && verdict === 'good') {
    return 'In retargeting, frequency 2-3 is the sweet spot — your audience is seeing the ad enough to be reminded but not enough to feel chased.';
  }
  if (ctx.metric === 'frequency' && ctx.campaignType === 'prospecting' && verdict === 'concerning') {
    return 'In prospecting, frequency above 3.5 means you are showing the same creative to the same people too many times — fatigue is setting in.';
  }
  if (ctx.metric === 'completion_rate' && verdict === 'good' && ctx.metric === 'completion_rate') {
    return 'Strong watch-through means the creative holds attention. If clicks/conversions are weaker than this suggests, the issue is your CTA or offer, not the video.';
  }
  if (ctx.metric === 'ctr' && verdict === 'critical') {
    return 'CTR this low means the ad is not connecting with the audience or the targeting is off — not a creative-fatigue problem yet, more likely a hook/audience-fit problem.';
  }
  return `The value falls in the ${verdict} band based on industry benchmarks${ctx.campaignType ? ` for ${ctx.campaignType}` : ''}.`;
}

function buildAction(ctx: MetricContext, verdict: Verdict): string {
  if (verdict === 'excellent' || verdict === 'good') {
    if (ctx.metric === 'ctr' || ctx.metric === 'roas') return 'Consider scaling budget (with significance gating).';
    if (ctx.metric === 'hook_rate') return 'Generate more variations from this winning hook.';
    return 'Maintain current settings.';
  }
  if (verdict === 'concerning' || verdict === 'critical') {
    if (ctx.metric === 'ctr') return 'Refresh creative AND review targeting — both could contribute.';
    if (ctx.metric === 'frequency') return 'Refresh creative (new hooks) or expand audience.';
    if (ctx.metric === 'cpa') return 'Check landing page conversion + reduce bids on weak audiences.';
    if (ctx.metric === 'completion_rate') return 'Shorten the video or strengthen the first 3 seconds (hook).';
    return 'Investigate before scaling.';
  }
  return 'No action — continue collecting data.';
}

function buildBenchmark(band: Band, ctx: MetricContext): string {
  if (!band.normal) return '';
  const [lo, hi] = band.normal;
  const ctxLabel = ctx.campaignType ?? ctx.category ?? 'this metric';
  if (ctx.metric === 'ctr' || ctx.metric === 'hook_rate' || ctx.metric === 'completion_rate') {
    return `Typical for ${ctxLabel}: ${(lo * 100).toFixed(1)}% – ${(hi * 100).toFixed(1)}%`;
  }
  if (ctx.metric === 'roas') return `Typical for ${ctxLabel}: ${lo.toFixed(1)}× – ${hi.toFixed(1)}×`;
  if (ctx.metric === 'cpa') return `Typical for ${ctxLabel}: $${lo} – $${hi}`;
  return `Typical for ${ctxLabel}: ${lo} – ${hi}`;
}

/**
 * Bulk-interpret a campaign's full metric set. Returns the most-pressing
 * interpretation by verdict severity, plus all individual readings.
 */
export interface CampaignSnapshot {
  campaignType?: CampaignType;
  category?: Category;
  daysRunning?: number;
  spendUsd?: number;
  ctr?: number;
  frequency?: number;
  hook_rate?: number;
  completion_rate?: number;
  roas?: number;
  cpa?: number;
}

export function interpretCampaign(snap: CampaignSnapshot): {
  primary: Interpretation | null;
  all: Interpretation[];
} {
  const all: Interpretation[] = [];
  const baseCtx = {
    campaignType: snap.campaignType,
    category: snap.category,
    daysRunning: snap.daysRunning,
    spendUsd: snap.spendUsd,
  };
  if (snap.ctr != null) all.push(interpret({ ...baseCtx, metric: 'ctr', value: snap.ctr }));
  if (snap.frequency != null) all.push(interpret({ ...baseCtx, metric: 'frequency', value: snap.frequency }));
  if (snap.hook_rate != null) all.push(interpret({ ...baseCtx, metric: 'hook_rate', value: snap.hook_rate }));
  if (snap.completion_rate != null) all.push(interpret({ ...baseCtx, metric: 'completion_rate', value: snap.completion_rate }));
  if (snap.roas != null) all.push(interpret({ ...baseCtx, metric: 'roas', value: snap.roas }));
  if (snap.cpa != null) all.push(interpret({ ...baseCtx, metric: 'cpa', value: snap.cpa }));

  const severityRank: Record<Verdict, number> = {
    critical: 5, concerning: 4, normal: 3, good: 2, excellent: 1,
  };
  const primary = all.length === 0
    ? null
    : all.reduce((a, b) => severityRank[b.verdict] > severityRank[a.verdict] ? b : a);

  return { primary, all };
}

// Optimization Rules Engine
// Evaluates each campaign using platform- and objective-specific benchmarks.
// MVP: rule-based only (no ML).

export type OptimizationAction =
  | { type: 'pause';          reason: string }
  | { type: 'resume';         reason: string }
  | { type: 'scale_up';       factor: number; reason: string }
  | { type: 'scale_down';     factor: number; reason: string }
  | { type: 'no_action';      reason: string }
  | { type: 'needs_creative'; reason: string };

export type Platform = 'google' | 'meta' | 'tiktok';

// campaign_type mirrors what's stored in the campaigns table
export type CampaignType =
  | 'search'           // Google Search
  | 'display'          // Google Display / GDN
  | 'shopping'         // Google Shopping
  | 'video'            // YouTube / TikTok video
  | 'awareness'        // Meta/TikTok brand awareness, reach
  | 'traffic'          // Meta/TikTok link clicks, landing page views
  | 'conversions'      // Meta/TikTok conversions, purchases, leads
  | 'retargeting'      // Retargeting / remarketing (any platform)
  | string;            // forward-compatible

export interface CampaignMetrics {
  campaignId: string;
  externalId: string;
  platform: Platform;
  campaignType: CampaignType;
  clicks: number;
  impressions: number;
  spend: number;           // USD lifetime (within the tracking window)
  dailyBudgetUsd: number;
  daysRunning: number;
  status: string;
  recentCtr?: number;      // CTR last 3 days — for creative fatigue
  baselineCtr?: number;    // CTR days 4–7 — baseline for comparison
}

interface Benchmark {
  minCtr: number;          // below this = underperforming
  goodCtr: number;         // above this = strong, eligible to scale up
  minDataClicks: number;   // need at least this many clicks before acting
  learningDays: number;    // hands-off learning period (days)
}

// Industry benchmarks by platform + campaign type.
// Source: Meta, Google, TikTok published averages (2024–2025).
// These are the fallback when the client has no personal history.
const BENCHMARKS: Record<Platform, Record<string, Benchmark>> = {
  meta: {
    awareness:   { minCtr: 0.005, goodCtr: 0.015, minDataClicks: 20,  learningDays: 7 },
    traffic:     { minCtr: 0.010, goodCtr: 0.025, minDataClicks: 30,  learningDays: 7 },
    conversions: { minCtr: 0.008, goodCtr: 0.020, minDataClicks: 30,  learningDays: 10 }, // longer — pixel needs data
    retargeting: { minCtr: 0.020, goodCtr: 0.040, minDataClicks: 20,  learningDays: 5  },
    video:       { minCtr: 0.005, goodCtr: 0.015, minDataClicks: 20,  learningDays: 7  },
    default:     { minCtr: 0.008, goodCtr: 0.020, minDataClicks: 25,  learningDays: 7  },
  },
  google: {
    search:      { minCtr: 0.030, goodCtr: 0.060, minDataClicks: 30,  learningDays: 7  },
    display:     { minCtr: 0.001, goodCtr: 0.005, minDataClicks: 50,  learningDays: 7  },
    shopping:    { minCtr: 0.005, goodCtr: 0.020, minDataClicks: 30,  learningDays: 7  },
    video:       { minCtr: 0.003, goodCtr: 0.010, minDataClicks: 30,  learningDays: 7  },
    conversions: { minCtr: 0.020, goodCtr: 0.050, minDataClicks: 30,  learningDays: 10 },
    retargeting: { minCtr: 0.010, goodCtr: 0.030, minDataClicks: 20,  learningDays: 5  },
    default:     { minCtr: 0.020, goodCtr: 0.050, minDataClicks: 30,  learningDays: 7  },
  },
  tiktok: {
    awareness:   { minCtr: 0.005, goodCtr: 0.020, minDataClicks: 20,  learningDays: 7  },
    traffic:     { minCtr: 0.010, goodCtr: 0.030, minDataClicks: 30,  learningDays: 7  },
    conversions: { minCtr: 0.008, goodCtr: 0.025, minDataClicks: 30,  learningDays: 10 },
    video:       { minCtr: 0.005, goodCtr: 0.020, minDataClicks: 20,  learningDays: 7  },
    retargeting: { minCtr: 0.020, goodCtr: 0.040, minDataClicks: 20,  learningDays: 5  },
    default:     { minCtr: 0.008, goodCtr: 0.022, minDataClicks: 25,  learningDays: 7  },
  },
};

function getBenchmark(platform: Platform, campaignType: CampaignType): Benchmark {
  const platformBenchmarks = BENCHMARKS[platform] ?? BENCHMARKS.meta;
  return platformBenchmarks[campaignType] ?? platformBenchmarks['default'];
}

const SCALE_UP_FACTOR   = 1.20; // +20% budget
const SCALE_DOWN_FACTOR = 0.80; // −20% budget
const MAX_CPC_MULTIPLIER = 2.5; // CPC > 2.5× expected → scale down

export function evaluateCampaign(metrics: CampaignMetrics): OptimizationAction {
  const { clicks, impressions, spend, dailyBudgetUsd, daysRunning, status, platform, campaignType } = metrics;

  if (status !== 'active') {
    return { type: 'no_action', reason: 'Campaign is not active' };
  }

  const bench = getBenchmark(platform, campaignType);

  // Learning period: hands-off. Only catch hard failures (zero impressions).
  const isLearning = daysRunning < bench.learningDays || clicks < bench.minDataClicks;

  if (impressions === 0 && daysRunning >= 2) {
    return { type: 'pause', reason: 'Zero impressions after 2 days — check targeting or ad creative' };
  }

  if (isLearning) {
    const daysLeft = Math.max(0, bench.learningDays - daysRunning);
    return {
      type: 'no_action',
      reason: daysLeft > 0
        ? `Learning period: ${daysLeft} day(s) left before optimization starts`
        : `Collecting data — need ${bench.minDataClicks - clicks} more clicks before optimizing`,
    };
  }

  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const clicksPerDay = clicks / daysRunning;
  const expectedCpc = dailyBudgetUsd / Math.max(clicksPerDay, 1);

  // Very low daily clicks — flag but don't cut budget
  if (clicksPerDay < 2) {
    return {
      type: 'no_action',
      reason: `Low traffic: ${clicksPerDay.toFixed(1)} clicks/day. Consider increasing budget or broadening targeting.`,
    };
  }

  // CTR below minimum for this platform + objective → scale down
  if (impressions > 500 && ctr < bench.minCtr) {
    const pct = (ctr * 100).toFixed(2);
    const target = (bench.minCtr * 100).toFixed(1);
    return {
      type: 'scale_down',
      factor: SCALE_DOWN_FACTOR,
      reason: `CTR ${pct}% is below ${target}% minimum for ${platform} ${campaignType} — reducing budget`,
    };
  }

  // CPC too high → scale down
  if (clicks >= 15 && cpc > expectedCpc * MAX_CPC_MULTIPLIER) {
    return {
      type: 'scale_down',
      factor: SCALE_DOWN_FACTOR,
      reason: `CPC $${cpc.toFixed(2)} is ${(cpc / expectedCpc).toFixed(1)}× expected — reducing budget`,
    };
  }

  // Creative fatigue: recent CTR dropped >30% vs baseline
  if (
    metrics.recentCtr !== undefined &&
    metrics.baselineCtr !== undefined &&
    metrics.baselineCtr > bench.minCtr * 0.5 &&
    metrics.recentCtr < metrics.baselineCtr * 0.70
  ) {
    const drop = ((1 - metrics.recentCtr / metrics.baselineCtr) * 100).toFixed(0);
    return {
      type: 'needs_creative',
      reason: `CTR dropped ${drop}% vs baseline — creative fatigue on ${platform} ${campaignType}, generate a new variation`,
    };
  }

  // Strong CTR → scale up
  if (ctr >= bench.goodCtr) {
    const pct = (ctr * 100).toFixed(2);
    const target = (bench.goodCtr * 100).toFixed(1);
    return {
      type: 'scale_up',
      factor: SCALE_UP_FACTOR,
      reason: `CTR ${pct}% exceeds ${target}% target for ${platform} ${campaignType} — scaling up by 20%`,
    };
  }

  return { type: 'no_action', reason: 'Performance within normal range' };
}

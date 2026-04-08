// Optimization Rules Engine
// Runs on a schedule — evaluates each campaign and decides what to do.
// MVP: rule-based only (no ML). Each campaign gets a decision per run.

export type OptimizationAction =
  | { type: 'pause';         reason: string }
  | { type: 'resume';        reason: string }
  | { type: 'scale_up';      factor: number; reason: string }
  | { type: 'scale_down';    factor: number; reason: string }
  | { type: 'no_action';     reason: string }
  | { type: 'needs_creative'; reason: string };

export interface CampaignMetrics {
  campaignId: string;       // internal DB id
  externalId: string;
  platform: 'google' | 'meta';
  clicks: number;
  impressions: number;
  spend: number;            // USD
  dailyBudgetUsd: number;
  daysRunning: number;
  status: string;
}

// Target thresholds — tunable
const THRESHOLDS = {
  MIN_CLICKS_PER_DAY:     3,    // below this → needs attention
  MIN_CTR:                0.01, // 1% minimum CTR
  MAX_CPC_MULTIPLIER:     2.5,  // if CPC > 2.5x expected → scale down
  GOOD_CTR:               0.03, // 3%+ CTR → scale up
  MIN_DATA_CLICKS:        30,   // need at least 30 clicks before scaling
  SCALE_UP_FACTOR:        1.2,  // +20% budget
  SCALE_DOWN_FACTOR:      0.8,  // -20% budget
};

export function evaluateCampaign(metrics: CampaignMetrics): OptimizationAction {
  const { clicks, impressions, spend, dailyBudgetUsd, daysRunning, status } = metrics;

  // Skip paused/error campaigns
  if (status !== 'active') {
    return { type: 'no_action', reason: 'Campaign is not active' };
  }

  // Not enough data yet
  if (daysRunning < 2) {
    return { type: 'no_action', reason: 'Not enough data yet (< 2 days)' };
  }

  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const expectedCpc = dailyBudgetUsd / Math.max(clicks / daysRunning, 1);
  const clicksPerDay = clicks / daysRunning;

  // Zero impressions after 2 days → pause (something is wrong)
  if (impressions === 0 && daysRunning >= 2) {
    return { type: 'pause', reason: 'Zero impressions after 2 days — check targeting or creative' };
  }

  // Very low clicks — not enough data, but warn
  if (clicksPerDay < THRESHOLDS.MIN_CLICKS_PER_DAY && daysRunning >= 3) {
    return {
      type: 'no_action',
      reason: `Low traffic: ${clicksPerDay.toFixed(1)} clicks/day. Consider increasing budget.`,
    };
  }

  // CTR too low → scale down (wasting impressions)
  if (impressions > 500 && ctr < THRESHOLDS.MIN_CTR) {
    return {
      type: 'scale_down',
      factor: THRESHOLDS.SCALE_DOWN_FACTOR,
      reason: `CTR ${(ctr * 100).toFixed(2)}% is below 1% minimum — reducing budget`,
    };
  }

  // CPC too high → scale down
  if (clicks >= 10 && cpc > expectedCpc * THRESHOLDS.MAX_CPC_MULTIPLIER) {
    return {
      type: 'scale_down',
      factor: THRESHOLDS.SCALE_DOWN_FACTOR,
      reason: `CPC $${cpc.toFixed(2)} is ${(cpc / expectedCpc).toFixed(1)}x expected — reducing budget`,
    };
  }

  // Good CTR + enough data → scale up
  if (clicks >= THRESHOLDS.MIN_DATA_CLICKS && ctr >= THRESHOLDS.GOOD_CTR) {
    return {
      type: 'scale_up',
      factor: THRESHOLDS.SCALE_UP_FACTOR,
      reason: `CTR ${(ctr * 100).toFixed(2)}% is strong — scaling up budget by 20%`,
    };
  }

  return { type: 'no_action', reason: 'Performance within normal range' };
}

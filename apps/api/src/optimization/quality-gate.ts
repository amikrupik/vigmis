// Quality Gate — validates data sufficiency before allowing budget decisions.
// Core question: "Do we know enough to act, or is this signal just noise?"
//
// Non-budget actions (pause for critical issues, alert, targeting review, creative refresh)
// always pass — they are either reversible or necessary regardless of data volume.
// Budget changes (scale_up, scale_down, pause) are gated by volume + confidence.

import type { OptimizationAction, CampaignMetrics } from './rules.js';
import type { PortfolioRole } from './portfolio.js';

export interface QualityGateResult {
  shouldAct: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  // If shouldAct=false: how many hours more data to collect before re-checking
  monitorHours: number;
}

// Minimum thresholds before making any budget decision
const MIN_IMPRESSIONS_FOR_BUDGET = 500;
const MIN_CLICKS_FOR_BUDGET = 20;
const HIGH_CONFIDENCE_CLICKS = 100;
const HIGH_CONFIDENCE_IMPRESSIONS = 5000;

// For pause decisions: lower bar — a critical issue should still be actioned even with thin data
const CRITICAL_PAUSE_MIN_IMPRESSIONS = 200;

export function checkQualityGate(
  action: OptimizationAction,
  metrics: CampaignMetrics,
  portfolioRole: PortfolioRole,
): QualityGateResult {

  // ── Non-budget actions always pass ──────────────────────────────────────────
  // Alerting a client, refreshing a creative, or reviewing targeting doesn't
  // require statistical confidence — the signal is directional, not quantitative.
  if (
    action.type === 'no_action' ||
    action.type === 'resume' ||
    action.type === 'needs_creative' ||
    action.type === 'needs_targeting_review'
  ) {
    return { shouldAct: true, confidence: 'high', reason: 'Non-budget action — data gate not applicable.', monitorHours: 0 };
  }

  if (action.type === 'alert') {
    return { shouldAct: true, confidence: 'high', reason: 'Alert — send regardless of data volume.', monitorHours: 0 };
  }

  // ── Learning-phase protection ────────────────────────────────────────────────
  // Scale-down or pause during learning phase almost always resets the algorithm
  // and wastes the spend already invested. Only allow if it's truly critical.
  if (portfolioRole === 'learning' && (action.type === 'scale_down' || action.type === 'pause')) {
    const daysLeft = Math.max(0, 7 - metrics.daysRunning);
    if (daysLeft > 0) {
      return {
        shouldAct: false,
        confidence: 'low',
        reason: `Campaign is in the learning phase (day ${metrics.daysRunning} of 7). A budget reduction or pause at this stage resets the algorithm's learning progress and wastes the $${metrics.spend.toFixed(0)} already spent building audience data. Wait ${daysLeft} more day${daysLeft > 1 ? 's' : ''} before considering budget changes.`,
        monitorHours: daysLeft * 24,
      };
    }
  }

  // ── Impression gate ──────────────────────────────────────────────────────────
  const minImpressions = action.type === 'pause' ? CRITICAL_PAUSE_MIN_IMPRESSIONS : MIN_IMPRESSIONS_FOR_BUDGET;
  if (metrics.impressions < minImpressions) {
    const hoursNeeded = 24;
    return {
      shouldAct: false,
      confidence: 'low',
      reason: `Only ${metrics.impressions.toLocaleString()} impressions recorded. Need ${minImpressions.toLocaleString()}+ before making budget decisions — current data could be a one-day anomaly. Monitor ${hoursNeeded}h more.`,
      monitorHours: hoursNeeded,
    };
  }

  // ── Click gate ───────────────────────────────────────────────────────────────
  if (metrics.clicks < MIN_CLICKS_FOR_BUDGET) {
    return {
      shouldAct: false,
      confidence: 'low',
      reason: `Only ${metrics.clicks} clicks — need ${MIN_CLICKS_FOR_BUDGET}+ for a statistically meaningful CTR signal. With ${metrics.clicks} clicks, the 95% confidence interval is too wide to act on. Monitor 24h more.`,
      monitorHours: 24,
    };
  }

  // ── High confidence — act ────────────────────────────────────────────────────
  if (metrics.clicks >= HIGH_CONFIDENCE_CLICKS && metrics.impressions >= HIGH_CONFIDENCE_IMPRESSIONS) {
    return {
      shouldAct: true,
      confidence: 'high',
      reason: `${metrics.clicks.toLocaleString()} clicks / ${metrics.impressions.toLocaleString()} impressions — strong data signal. Decision confidence: high.`,
      monitorHours: 0,
    };
  }

  // ── Medium confidence — act but caveat ──────────────────────────────────────
  return {
    shouldAct: true,
    confidence: 'medium',
    reason: `${metrics.clicks} clicks / ${metrics.impressions.toLocaleString()} impressions — moderate data. Recommendation is directionally sound but based on limited sample. Consider the Conservative option.`,
    monitorHours: 0,
  };
}

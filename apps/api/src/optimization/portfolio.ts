// Portfolio Classifier — assigns each campaign its strategic role.
// Each role is measured differently; applying ROAS to an awareness campaign
// or CPA to a learning campaign produces meaningless signals.

import type { CampaignMetrics } from './rules.js';

export type PortfolioRole =
  | 'cash_cow'     // proven ROAS > 2 after learning; measure by ROAS
  | 'retargeting'  // warm audience re-engagement; measure by CPA
  | 'learning'     // new campaign in data-collection phase; measure by cost-per-learning
  | 'awareness'    // brand reach / top-of-funnel; measure by CPM + reach
  | 'defense';     // branded keyword protection; measure by impression share

export interface PortfolioClassification {
  role: PortfolioRole;
  primaryMetric: string;
  secondaryMetric: string | null;
  // How to interpret "underperforming" for this role
  evaluationNote: string;
}

// Conservative ROAS threshold — campaigns need clear profitability signal to graduate to cash_cow.
const CASH_COW_ROAS = 2.0;
// Learning period: avoid scaling decisions before this many days
const MIN_LEARNING_DAYS = 7;
// Spend gate: avoid scaling before seeing meaningful spend
const MIN_LEARNING_SPEND = 150;

export function classifyPortfolioRole(metrics: CampaignMetrics): PortfolioClassification {
  const { campaignType, daysRunning, spend, conversions, revenue } = metrics;

  // Retargeting / remarketing — explicit objective
  if (campaignType === 'retargeting') {
    return {
      role: 'retargeting',
      primaryMetric: 'CPA',
      secondaryMetric: 'conversion rate',
      evaluationNote: 'Retargeting campaigns are evaluated on CPA, not CTR. A high CPA with low conversion rate signals audience fatigue or a landing page issue.',
    };
  }

  // Awareness — reach objective
  if (campaignType === 'awareness') {
    return {
      role: 'awareness',
      primaryMetric: 'CPM',
      secondaryMetric: 'reach',
      evaluationNote: 'Awareness campaigns are evaluated on CPM and reach, not ROAS or CTR. Low CTR is expected and normal for awareness-objective ads.',
    };
  }

  // Learning phase — too early to judge by any ROI metric
  if (daysRunning < MIN_LEARNING_DAYS || spend < MIN_LEARNING_SPEND) {
    return {
      role: 'learning',
      primaryMetric: 'cost-per-data-point',
      secondaryMetric: 'impressions',
      evaluationNote: `Campaign is still in the learning phase (${daysRunning} days / $${spend.toFixed(0)} spent). Ad algorithms need ${MIN_LEARNING_DAYS}+ days and $${MIN_LEARNING_SPEND}+ spend to exit the learning phase. Budget scaling decisions before this point often reset learning and waste data.`,
    };
  }

  // Cash cow — proven performer with clear ROAS signal
  const roas = revenue && spend > 0 ? revenue / spend : null;
  if (roas !== null && roas >= CASH_COW_ROAS && conversions && conversions >= 10) {
    return {
      role: 'cash_cow',
      primaryMetric: 'ROAS',
      secondaryMetric: 'CPA',
      evaluationNote: `Campaign has proven ROAS of ${roas.toFixed(1)}× with ${conversions} conversions. Evaluate primarily on ROAS and CPA trends, not CTR.`,
    };
  }

  // Default: still learning / testing; judge on clicks and cost efficiency
  return {
    role: 'learning',
    primaryMetric: 'CTR',
    secondaryMetric: 'CPC',
    evaluationNote: 'Campaign is past the initial learning phase but has not yet proven ROI. Evaluate on CTR and CPC efficiency as leading indicators.',
  };
}

export function portfolioRoleBadge(role: PortfolioRole): string {
  switch (role) {
    case 'cash_cow':    return '💰 Cash Cow';
    case 'retargeting': return '🎯 Retargeting';
    case 'learning':    return '📚 Learning';
    case 'awareness':   return '📢 Awareness';
    case 'defense':     return '🛡 Defense';
  }
}

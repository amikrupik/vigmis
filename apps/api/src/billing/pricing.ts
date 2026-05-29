// Pricing & quota model — single source of truth for fees, plan allowances,
// add-on prices, and the per-customer AI-cost guardrail.
//
// Decided 2026-05-30. Customer-facing version lives in docs/VIGMIS_FEATURES_HE.
// Principle: allowances scale with ad spend (higher spend funds more AI
// consumption), so gross margin stays flat (~80%+) across every tier.

export type Plan = 'free' | 'pro'; // 'free' = Starter (customer-facing name)

export const PLAN_PRICING: Record<Plan, {
  ratePct: number;          // % of managed ad spend
  subscriptionUsd: number;  // flat monthly subscription
  floorUsd: number;         // minimum monthly management charge
  breakerFreezePct: number; // freeze AI when AI cost crosses this % of fee
}> = {
  free: { ratePct: 7, subscriptionUsd: 0,  floorUsd: 29, breakerFreezePct: 30 },
  pro:  { ratePct: 6, subscriptionUsd: 49, floorUsd: 49, breakerFreezePct: 40 },
};

// A chat "conversation" is one session, soft-capped at this many messages.
// Beyond it, a new conversation is counted (bounds per-conversation cost).
export const MESSAGES_PER_CONVERSATION = 12;

export interface Allowances {
  tier: 1 | 2 | 3 | 4 | 5;
  conversations: number;   // AI advisor chat sessions / month
  commentsHandled: number; // comments auto-triaged + drafted / month
  activeCampaigns: number;
  channels: number;        // connected platforms; Infinity = unlimited
  shopifyProducts: number;
}

// maxSpend is the upper bound (inclusive) of each spend tier, in USD/month.
const TIERS: Array<{ maxSpend: number } & Omit<Allowances, 'tier'>> = [
  { maxSpend: 1000,     conversations: 30,  commentsHandled: 300,  activeCampaigns: 3,        channels: 2,        shopifyProducts: 500 },
  { maxSpend: 3000,     conversations: 75,  commentsHandled: 800,  activeCampaigns: 6,        channels: 2,        shopifyProducts: 1500 },
  { maxSpend: 6000,     conversations: 150, commentsHandled: 2000, activeCampaigns: 10,       channels: 3,        shopifyProducts: 5000 },
  { maxSpend: 12000,    conversations: 300, commentsHandled: 4000, activeCampaigns: 20,       channels: Infinity, shopifyProducts: 10000 },
  { maxSpend: Infinity, conversations: 400, commentsHandled: 6000, activeCampaigns: Infinity, channels: Infinity, shopifyProducts: Infinity },
];

export function getAllowances(monthlySpendUsd: number): Allowances {
  const idx = TIERS.findIndex((t) => monthlySpendUsd <= t.maxSpend);
  const i = idx === -1 ? TIERS.length - 1 : idx;
  const t = TIERS[i];
  return {
    tier: (i + 1) as Allowances['tier'],
    conversations: t.conversations,
    commentsHandled: t.commentsHandled,
    activeCampaigns: t.activeCampaigns,
    channels: t.channels,
    shopifyProducts: t.shopifyProducts,
  };
}

// Pro unlocks all channels regardless of spend tier.
export function effectiveChannels(plan: Plan, monthlySpendUsd: number): number {
  return plan === 'pro' ? Infinity : getAllowances(monthlySpendUsd).channels;
}

// Metered add-ons — price charged to the customer, in USD.
export const ADDON_PRICES = {
  socialPost: 1.00,
  tiktokPost: 3.00,
  commentReply: 0.05,
  conversationPack25: 9.00, // +25 AI advisor conversations
  videoCinematic: 12.00,
  videoAvatar: 15.00,
  videoAnimation: 8.00,
  banner: 5.00,
} as const;

// Pro includes these per month before per-use metering kicks in.
export const PRO_INCLUDED = { videos: 1, banners: 2 } as const;

// Circuit breaker — share of the month's fee we let AI cost reach before acting.
//   >= degradeAtPct : route routine tasks (triage/sentiment) to the cheap model,
//                     pause non-essential crons (news/weather/insights).
//   >= freezeAtPct  : freeze AI features + alert ops (reuse stop-loss).
export const BREAKER = { degradeAtPct: 25, freezeAtPct: 40 } as const;

/** Management fee for the month (subscription + % of spend), floored. */
export function monthlyFee(plan: Plan, managedSpendUsd: number): number {
  const p = PLAN_PRICING[plan];
  const raw = p.subscriptionUsd + managedSpendUsd * (p.ratePct / 100);
  return Math.round(Math.max(raw, p.floorUsd) * 100) / 100;
}

/** Where a tenant sits against the breaker, given AI cost so far this month. */
export function breakerState(
  plan: Plan,
  feeUsd: number,
  aiCostUsd: number,
): 'ok' | 'degrade' | 'freeze' {
  if (feeUsd <= 0) return aiCostUsd > 0 ? 'freeze' : 'ok';
  const pct = (aiCostUsd / feeUsd) * 100;
  if (pct >= BREAKER.freezeAtPct) return 'freeze';
  if (pct >= BREAKER.degradeAtPct) return 'degrade';
  return 'ok';
}

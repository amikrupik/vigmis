// Pricing & quota model — single source of truth for fees, plan allowances,
// add-on prices, and the per-customer AI-cost guardrail.
//
// Decided 2026-05-30. Updated 2026-06-03: plan names Grow/Scale (DB values
// remain 'free'/'pro' for backwards compat), subscription $0/$29, floors $29/$29,
// Image Creative replaces banner, free reply bundles 100/300, no customer-facing
// campaign limit (internal API rate-limit guardrail only), 3 Image Creatives/mo Scale.
// Customer-facing version lives in docs/VIGMIS_FEATURES_HE.
// Principle: allowances scale with ad spend (higher spend funds more AI
// consumption), so gross margin stays flat (~80%+) across every tier.

export type Plan = 'free' | 'pro'; // 'free' = Grow, 'pro' = Scale (customer-facing names)

export const PLAN_PRICING: Record<Plan, {
  ratePct: number;          // % of managed ad spend
  subscriptionUsd: number;  // flat monthly subscription
  floorUsd: number;         // minimum monthly management charge
  breakerFreezePct: number; // freeze AI when AI cost crosses this % of fee
  includedCampaigns: number;  // active campaigns included
  includedReplies: number;       // comment replies included per month
  includedVideos: number;        // videos included per month
  includedImageCreatives: number; // standalone image creatives per month
  includedSocialPosts: number;   // social posts (text+image+publish) per month
  maxUsers: number;              // seats per account
}> = {
  free: { ratePct: 7, subscriptionUsd: 0,  floorUsd: 29, breakerFreezePct: 30, includedCampaigns: 999, includedReplies: 100, includedVideos: 0, includedImageCreatives: 0, includedSocialPosts: 0, maxUsers: 1 },
  pro:  { ratePct: 6, subscriptionUsd: 29, floorUsd: 29, breakerFreezePct: 40, includedCampaigns: 999, includedReplies: 300, includedVideos: 1, includedImageCreatives: 3, includedSocialPosts: 5, maxUsers: 3 },
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
//
// Social posts:
//   socialPost        — AI caption + new AI-generated image + publish ($1.00)
//   socialPostReuse   — AI caption + user's own or reused creative + publish ($0.70)
//   Both types count against Scale's 5 included posts/month.
//
// Videos (animation/cinematic/avatar): publishing to FB, IG, or TikTok is INCLUDED
//   in the video price. Scale's 1 included video applies to any video type.
//   TikTok is not a separate line-item — buy any video, publish anywhere.
//
// Image Creative: standalone ad image for paid campaigns (not tied to a post).
export const ADDON_PRICES = {
  socialPost: 1.00,           // AI caption + new AI image + publish
  socialPostReuse: 0.70,      // AI caption + user/reused creative + publish
  commentReply: 0.05,         // per reply after free monthly bundle
  conversationPack25: 9.00,   // +25 AI Strategy Sessions
  videoCinematic: 12.00,      // publish to FB / IG / TikTok included
  videoAvatar: 15.00,
  videoAnimation: 8.00,
  imageCreative: 5.00,        // standalone ad image (not a post)
} as const;

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
  const freezeAt = PLAN_PRICING[plan].breakerFreezePct;
  if (pct >= freezeAt) return 'freeze';
  if (pct >= BREAKER.degradeAtPct) return 'degrade';
  return 'ok';
}

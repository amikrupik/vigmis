// Comment Priority Engine — scores each comment so the customer sees the
// highest-value ones first. Used by:
//   - Dashboard "Comments" tab (sort by priority)
//   - Lead digest (only top-N from the past window)
//   - Crisis detection (concentration of high-priority complaints)
//
// Score factors (0-100 each, weighted):
//   sentiment_weight    — purchase_intent/lead/complaint > others
//   recency_weight      — fresh comments score higher
//   urgency_weight      — legal_risk + crisis category bumps
//   reach_weight        — comments on high-reach posts matter more
//   business_value_hint — customer's goal (purchases vs awareness) shifts weights

import { db } from '@vigmis/db';
import type { Sentiment } from './social-comments.js';

interface PriorityInputs {
  sentiment: Sentiment;
  classifier_confidence: number;
  routing: string;
  do_not_engage: boolean;
  commented_at: string;
  post_reach?: number;
  goal?: 'leads' | 'purchases' | 'traffic' | 'awareness';
}

// Sentiment base scores. Higher = more attention-worthy.
const SENTIMENT_BASE: Record<Sentiment, number> = {
  legal_risk: 95,
  hate: 90,
  purchase_intent: 88,
  lead: 88,
  angry: 75,
  complaint: 70,
  question: 55,
  positive: 30,
  troll: 10,
  spam: 5,
  other: 25,
};

export function scoreComment(input: PriorityInputs): number {
  if (input.do_not_engage) return SENTIMENT_BASE[input.sentiment] * 0.3; // still tracked but de-prioritized

  let score = SENTIMENT_BASE[input.sentiment] ?? 25;

  // Recency: full score for last 4h, decays linearly to 0 over 5 days.
  const hoursAgo = (Date.now() - new Date(input.commented_at).getTime()) / 3600_000;
  const recencyMult = hoursAgo <= 4
    ? 1.0
    : Math.max(0.3, 1.0 - (hoursAgo - 4) / 120);
  score *= recencyMult;

  // Reach amplifier — comments on widely-seen posts matter more
  if (input.post_reach != null && input.post_reach > 1000) {
    const reachBoost = Math.min(0.3, Math.log10(input.post_reach / 1000) * 0.1);
    score *= 1 + reachBoost;
  }

  // Goal alignment
  if (input.goal === 'purchases' && (input.sentiment === 'purchase_intent' || input.sentiment === 'lead')) {
    score *= 1.2;
  }
  if (input.goal === 'leads' && input.sentiment === 'lead') {
    score *= 1.25;
  }

  // Cap at 100
  return Math.round(Math.min(100, score) * 100) / 100;
}

/**
 * Persist priority scores for all unscored comments in a tenant.
 * Run after fetch cron, or on demand.
 */
export async function scorePendingComments(tenantId: string): Promise<{ updated: number }> {
  const { data: settings } = await db.from('client_settings')
    .select('goal')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const goal = (settings?.goal as PriorityInputs['goal']) ?? 'purchases';

  const { data: comments } = await db.from('social_comments')
    .select('id, sentiment, classifier_confidence, routing_recommendation, do_not_engage, commented_at, post_id')
    .eq('tenant_id', tenantId)
    .is('priority_score', null)
    .neq('status', 'sent')
    .limit(500);

  if (!comments || comments.length === 0) return { updated: 0 };

  // Pull reach for the posts these comments are on
  const postIds = [...new Set(comments.map((c: { post_id: string }) => c.post_id))];
  const { data: analytics } = await db.from('social_analytics')
    .select('post_id, reach')
    .in('post_id', postIds);
  const reachByPost = Object.fromEntries(
    (analytics ?? []).map((a: { post_id: string; reach: number | null }) => [a.post_id, a.reach ?? 0]),
  );

  let updated = 0;
  for (const c of comments) {
    const score = scoreComment({
      sentiment: c.sentiment as Sentiment,
      classifier_confidence: Number(c.classifier_confidence) || 0,
      routing: c.routing_recommendation ?? 'public_reply',
      do_not_engage: c.do_not_engage,
      commented_at: c.commented_at,
      post_reach: reachByPost[c.post_id],
      goal,
    });
    await db.from('social_comments')
      .update({ priority_score: score })
      .eq('id', c.id);
    updated++;
  }
  return { updated };
}

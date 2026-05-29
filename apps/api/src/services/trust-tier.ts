// Trust Tier — per-tenant risk scoring on 3 orthogonal axes.
//
// What this is for: an automation system that's stricter with risky tenants
// and looser with proven-clean ones. The 3 axes are deliberately separate
// because each one tells you a different thing about a customer:
//
//   policy_violations   — they produce risky content
//   customer_complaints — their customers are unhappy with their ads
//   bypass_attempts     — they're TRYING to game the system
//
// Only the last one is high-signal-of-bad-intent. The first two could be
// legitimate businesses in tricky industries. The tier function combines them
// with different weights.

import { db } from '@vigmis/db';

export type TrustTier = 'trusted' | 'standard' | 'watch' | 'restricted';

export type BypassAttemptKind =
  | 'resubmit_blocked_with_trivial_edit'
  | 'missing_attestation'
  | 'rapid_retry_after_block'
  | 'classifier_evasion_pattern'
  | 'admin_flagged';

export interface TrustTierState {
  tenant_id: string;
  tier: TrustTier;
  tier_reason: string;
  policy_violations_90d: number;
  customer_complaints_90d: number;
  bypass_attempts_90d: number;
  manual_override_tier: TrustTier | null;
  last_recomputed_at: string;
}

/**
 * Compute a tenant's tier from raw signals. Lower is better.
 *
 * Bypass attempts are weighted heavily — trying to game the system is the
 * strongest negative signal. Policy violations are moderate. Complaints are
 * lightest because lots of legitimate businesses get complaints.
 */
export function computeTier(signals: {
  policy_violations_90d: number;
  customer_complaints_90d: number;
  bypass_attempts_90d: number;
  tenant_age_days?: number;
}): { tier: TrustTier; reason: string } {
  const pv = signals.policy_violations_90d;
  const cc = signals.customer_complaints_90d;
  const ba = signals.bypass_attempts_90d;
  const age = signals.tenant_age_days ?? 0;

  // Any bypass attempt is a hard red flag.
  if (ba >= 3) {
    return { tier: 'restricted', reason: `${ba} bypass attempts in 90 days — automation restricted, all publishes require human review` };
  }
  if (ba >= 1) {
    return { tier: 'watch', reason: `${ba} bypass attempt(s) in 90 days — high-stakes content requires human review` };
  }

  // Many policy violations even without bypass = risky business profile.
  if (pv >= 10) {
    return { tier: 'restricted', reason: `${pv} policy violations in 90 days — automation restricted` };
  }
  if (pv >= 5) {
    return { tier: 'watch', reason: `${pv} policy violations in 90 days — high-stakes content requires human review` };
  }

  // Complaints are weakest signal but still informative at scale.
  if (cc >= 20) {
    return { tier: 'watch', reason: `${cc} customer complaints in 90 days — reviewing pattern` };
  }

  // Clean track record AND seasoned tenant → trusted (looser gates).
  if (pv === 0 && ba === 0 && cc <= 2 && age >= 90) {
    return { tier: 'trusted', reason: 'Clean 90-day record; seasoned tenant' };
  }

  return { tier: 'standard', reason: 'Standard tier — default policy gates apply' };
}

/**
 * Recompute and persist a tenant's trust tier. Should be called:
 *  - daily by cron
 *  - after every content_decisions block
 *  - after every bypass_attempts insert
 *  - after every customer complaint
 */
export async function recomputeTrustTier(tenantId: string): Promise<TrustTierState> {
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [violationsRes, complaintsRes, bypassRes, tenantRes] = await Promise.all([
    db
      .from('content_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('decision', ['block', 'require_human_review'])
      .gte('created_at', cutoff90d),
    db
      .from('social_comments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('sentiment', 'complaint')
      .gte('created_at', cutoff90d),
    db
      .from('bypass_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', cutoff90d),
    db
      .from('tenants')
      .select('created_at')
      .eq('id', tenantId)
      .single(),
  ]);

  const pv = violationsRes.count ?? 0;
  const cc = complaintsRes.count ?? 0;
  const ba = bypassRes.count ?? 0;
  const tenantAgeDays = tenantRes.data
    ? Math.floor((Date.now() - new Date(tenantRes.data.created_at).getTime()) / (24 * 3600 * 1000))
    : 0;

  // Check for manual override
  const { data: existing } = await db
    .from('tenant_trust_tier')
    .select('manual_override_tier, manual_override_reason')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  let computed = computeTier({
    policy_violations_90d: pv,
    customer_complaints_90d: cc,
    bypass_attempts_90d: ba,
    tenant_age_days: tenantAgeDays,
  });

  if (existing?.manual_override_tier) {
    computed = {
      tier: existing.manual_override_tier as TrustTier,
      reason: `Manual override: ${existing.manual_override_reason ?? 'set by admin'}`,
    };
  }

  const now = new Date().toISOString();
  await db.from('tenant_trust_tier').upsert(
    {
      tenant_id: tenantId,
      policy_violations_90d: pv,
      customer_complaints_90d: cc,
      bypass_attempts_90d: ba,
      tier: computed.tier,
      tier_reason: computed.reason,
      last_recomputed_at: now,
      updated_at: now,
    },
    { onConflict: 'tenant_id' },
  );

  return {
    tenant_id: tenantId,
    tier: computed.tier,
    tier_reason: computed.reason,
    policy_violations_90d: pv,
    customer_complaints_90d: cc,
    bypass_attempts_90d: ba,
    manual_override_tier: (existing?.manual_override_tier as TrustTier | null) ?? null,
    last_recomputed_at: now,
  };
}

/**
 * Fetch current cached tier. Falls back to recompute if no row exists.
 * Use this on the hot path (publish, approve) — cheap read.
 */
export async function getTrustTier(tenantId: string): Promise<TrustTier> {
  const { data } = await db
    .from('tenant_trust_tier')
    .select('tier')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (data) return data.tier as TrustTier;

  const state = await recomputeTrustTier(tenantId);
  return state.tier;
}

/**
 * Action gate: given a tenant's tier and the action they're trying to take,
 * decide whether it can proceed automatically or requires human review.
 */
export function actionGateForTier(
  tier: TrustTier,
  action: 'auto_publish' | 'high_stakes_publish' | 'scale_up_budget' | 'scale_down_budget' | 'generation',
): { allow: boolean; requiresHumanReview: boolean; reason: string } {
  switch (tier) {
    case 'trusted':
      return { allow: true, requiresHumanReview: false, reason: 'Trusted tenant — full automation' };
    case 'standard':
      if (action === 'high_stakes_publish') {
        return { allow: true, requiresHumanReview: true, reason: 'Standard tenant — high-stakes publish needs human review' };
      }
      return { allow: true, requiresHumanReview: false, reason: 'Standard tenant — automation OK for routine actions' };
    case 'watch':
      if (action === 'auto_publish' || action === 'high_stakes_publish') {
        return { allow: true, requiresHumanReview: true, reason: 'Watch tier — all publishes require human review' };
      }
      return { allow: true, requiresHumanReview: false, reason: 'Watch tier — non-publish automation still active' };
    case 'restricted':
      if (action === 'auto_publish' || action === 'high_stakes_publish' || action === 'scale_up_budget') {
        return { allow: false, requiresHumanReview: true, reason: 'Restricted tenant — automated publishing and scale-up disabled. Contact support.' };
      }
      return { allow: true, requiresHumanReview: true, reason: 'Restricted tenant — manual review required for all actions' };
  }
}

/**
 * Log a bypass attempt and trigger a tier recomputation.
 * Call this anywhere we detect suspicious behavior.
 */
export async function logBypassAttempt(args: {
  tenantId: string;
  clerkUserId?: string;
  kind: BypassAttemptKind;
  details?: Record<string, unknown>;
  relatedDecisionId?: string;
}): Promise<void> {
  await db.from('bypass_attempts').insert({
    tenant_id: args.tenantId,
    clerk_user_id: args.clerkUserId ?? null,
    attempt_kind: args.kind,
    details: args.details ?? null,
    related_decision_id: args.relatedDecisionId ?? null,
  });
  // Recompute synchronously — tier changes should reflect immediately for next action.
  await recomputeTrustTier(args.tenantId).catch(() => {});
}

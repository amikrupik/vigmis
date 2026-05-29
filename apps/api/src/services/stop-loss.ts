// Stop Loss — automatic customer offboarding when violations accumulate.
//
// Beyond Trust Tier (which throttles), Stop Loss is the actual "we're parting
// ways" trigger. It detects patterns that warrant terminating service:
//   - X policy blocks in Y days
//   - Multiple bypass attempts
//   - Active legal_risk content
//
// Action: freeze tenant + flag for manual termination review. Doesn't auto-
// terminate (legal/business decision) but raises a clear flag.

import { db } from '@vigmis/db';
import { sendEmail } from './notify.js';

const STOP_LOSS_THRESHOLDS = {
  policy_blocks_in_30d: 15,
  bypass_attempts_in_30d: 5,
  legal_risk_decisions_in_30d: 3,
};

export interface StopLossDecision {
  trigger: boolean;
  reasons: string[];
  metrics: {
    policy_blocks_30d: number;
    bypass_attempts_30d: number;
    legal_risk_30d: number;
  };
  recommended_action: 'freeze' | 'manual_review' | 'no_action';
}

export async function evaluateStopLoss(tenantId: string): Promise<StopLossDecision> {
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const [blocksRes, bypassRes, legalRes] = await Promise.all([
    db.from('content_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('decision', 'block')
      .gte('created_at', since),
    db.from('bypass_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', since),
    db.from('content_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('category', 'legal_risk')
      .gte('created_at', since),
  ]);

  const metrics = {
    policy_blocks_30d: blocksRes.count ?? 0,
    bypass_attempts_30d: bypassRes.count ?? 0,
    legal_risk_30d: legalRes.count ?? 0,
  };

  const reasons: string[] = [];
  if (metrics.policy_blocks_30d >= STOP_LOSS_THRESHOLDS.policy_blocks_in_30d) {
    reasons.push(`${metrics.policy_blocks_30d} policy blocks in 30 days (threshold ${STOP_LOSS_THRESHOLDS.policy_blocks_in_30d})`);
  }
  if (metrics.bypass_attempts_30d >= STOP_LOSS_THRESHOLDS.bypass_attempts_in_30d) {
    reasons.push(`${metrics.bypass_attempts_30d} bypass attempts in 30 days (threshold ${STOP_LOSS_THRESHOLDS.bypass_attempts_in_30d})`);
  }
  if (metrics.legal_risk_30d >= STOP_LOSS_THRESHOLDS.legal_risk_decisions_in_30d) {
    reasons.push(`${metrics.legal_risk_30d} legal-risk content events in 30 days (threshold ${STOP_LOSS_THRESHOLDS.legal_risk_decisions_in_30d})`);
  }

  if (reasons.length === 0) {
    return { trigger: false, reasons: [], metrics, recommended_action: 'no_action' };
  }

  // Severity: bypass attempts at threshold → freeze. Other patterns → manual review.
  const recommended_action: 'freeze' | 'manual_review' =
    metrics.bypass_attempts_30d >= STOP_LOSS_THRESHOLDS.bypass_attempts_in_30d ? 'freeze' : 'manual_review';

  return { trigger: true, reasons, metrics, recommended_action };
}

/**
 * Cron — runs daily across all active tenants. On trigger:
 *   - 'freeze' → mark tenant as frozen (admin manual unfreeze required)
 *   - 'manual_review' → email Vigmis ops team + flag in audit log
 */
export async function dispatchStopLossCron(): Promise<{ checked: number; flagged: number; frozen: number }> {
  const { data: tenants } = await db.from('tenants')
    .select('id, frozen')
    .eq('frozen', false);
  if (!tenants?.length) return { checked: 0, flagged: 0, frozen: 0 };

  let flagged = 0;
  let frozen = 0;
  for (const t of tenants) {
    const decision = await evaluateStopLoss(t.id).catch(() => null);
    if (!decision || !decision.trigger) continue;

    if (decision.recommended_action === 'freeze') {
      const now = new Date().toISOString();
      await db.from('tenants').update({
        frozen: true,
        freeze_reason: `Auto-freeze by stop-loss: ${decision.reasons.join('; ')}`,
        freeze_capabilities: ['publish', 'optimize', 'generation', 'crons'],
        frozen_at: now,
        frozen_by: 'system_stop_loss',
      }).eq('id', t.id);
      frozen++;
    }

    await db.from('audit_log').insert({
      tenant_id: t.id,
      action: 'stop_loss.triggered',
      actor: 'system',
      payload: decision,
    });
    flagged++;

    // Notify Vigmis ops
    const opsEmail = process.env.OPS_ALERT_EMAIL;
    if (opsEmail) {
      await sendEmail(
        opsEmail,
        `Stop-Loss triggered for tenant ${t.id}`,
        `<pre>${JSON.stringify(decision, null, 2)}</pre>`,
      ).catch(() => null);
    }
  }
  return { checked: tenants.length, flagged, frozen };
}

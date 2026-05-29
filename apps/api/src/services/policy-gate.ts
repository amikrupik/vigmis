// Policy Gate — thin wrapper that classifies + persists in one call.
//
// Use this from any service/route that wants to gate content. Don't call the
// raw classifier directly outside of /policy/classify — we want every decision
// to land in content_decisions for the audit trail.

import { db } from '@vigmis/db';
import {
  classifyContent,
  sha256Hex,
  type ClassifierInput,
  type ClassifierOutput,
  type ContentKind,
} from './policy-classifier.js';

export type DecisionSource = 'pre_flight' | 'post_flight' | 'onboarding' | 'chat' | 'manual_review';

export interface GateResult extends ClassifierOutput {
  decision_id: string | null;
  content_hash: string;
  persisted: boolean;
}

export interface GateInput extends ClassifierInput {
  tenantId: string;
  source: DecisionSource;
}

export async function classifyAndLog(input: GateInput): Promise<GateResult> {
  const result = await classifyContent({
    text: input.text,
    kind: input.kind,
    market: input.market,
    business_country: input.business_country,
    industry: input.industry,
  });

  const contentHash = sha256Hex(input.text);

  const { data, error } = await db
    .from('content_decisions')
    .insert({
      tenant_id: input.tenantId,
      content_kind: input.kind,
      content_text: input.text,
      content_hash: contentHash,
      decision: result.decision,
      tier: result.tier,
      category: result.category,
      reason: result.reason,
      suggested_rewrite: result.suggested_rewrite,
      classifier_version: result.classifier_version,
      source: input.source,
      decided_by: result.decided_by,
      model_used: result.model_used,
      tokens_used: result.tokens_used,
      latency_ms: result.latency_ms,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ...result, decision_id: null, content_hash: contentHash, persisted: false };
  }
  return { ...result, decision_id: data.id, content_hash: contentHash, persisted: true };
}

/**
 * Helper for content-kind callers that don't want to know about ContentKind enum.
 * Returns true if content should be allowed to proceed.
 */
export function decisionAllowsProceed(result: Pick<ClassifierOutput, 'decision'>): boolean {
  return result.decision === 'allow' || result.decision === 'allow_with_warning';
}

/**
 * Class of errors thrown by services when content is blocked by the policy gate.
 * Routes catch this and return structured 422 responses so the frontend can
 * show the reason and suggested rewrite.
 */
export class PolicyBlockedError extends Error {
  readonly code = 'POLICY_BLOCKED';
  constructor(
    message: string,
    readonly result: GateResult,
  ) {
    super(message);
  }
}

export type { ContentKind };

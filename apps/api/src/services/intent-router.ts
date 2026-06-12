// Intent Router — Layer 1 only: hard keyword policy check.
// Everything that passes goes straight to the main AI (Sonnet).
//
// Architecture decision: the LLM classifier (Layer 2) was removed because it
// caused false positives on legitimate marketing questions (geo-targeting,
// budget strategy) — classifying them as legal_block or ethical_block.
// The main AI is smarter and handles edge cases correctly on its own.

import { classifyAndLog } from './policy-gate.js';

export type IntentBucket =
  | 'native_capability'
  | 'subscription_gate'
  | 'platform_limitation'
  | 'legal_block'
  | 'ethical_block'
  | 'out_of_scope_adjacent';

export interface IntentClassification {
  bucket: IntentBucket;
  reason: string;
  user_facing_response: string;
  alternative: string | null;
  capability_hint: string | null;
  model_used: string;
}

export interface IntentContext {
  tenantId: string;
  message: string;
  pageContext?: string;
  subscription?: 'free' | 'basic' | 'pro';
}

export async function classifyIntent(ctx: IntentContext): Promise<IntentClassification> {
  // Layer 1: keyword policy check — blocks explicit requests for forbidden content.
  const policyCheck = await classifyAndLog({
    tenantId: ctx.tenantId,
    text: ctx.message,
    kind: 'chat_message',
    source: 'chat',
  });
  if (policyCheck.tier === 0) {
    return {
      bucket: 'ethical_block',
      reason: policyCheck.reason,
      user_facing_response:
        policyCheck.suggested_rewrite
          ? `I can't help with that as written — it triggers our content policy on "${policyCheck.category}". Try this instead: "${policyCheck.suggested_rewrite}".`
          : `I can't help with that — it triggers our content policy on "${policyCheck.category}". Vigmis only works with businesses that play it straight.`,
      alternative: policyCheck.suggested_rewrite ?? 'Rephrase your request to remove the flagged content, or contact support if you believe this is a mistake.',
      capability_hint: null,
      model_used: policyCheck.model_used ?? 'fast_path',
    };
  }

  // Everything else → main AI. It is smarter than any classifier and handles
  // edge cases (platform limitations, out-of-scope, subscription gates) correctly.
  return {
    bucket: 'native_capability',
    reason: 'Passed policy check — main AI handles.',
    user_facing_response: '',
    alternative: null,
    capability_hint: null,
    model_used: 'fast_path',
  };
}

export const NATIVE_CAPABILITIES = [
  'create_post', 'edit_post', 'approve_post', 'reject_post', 'schedule_post',
  'set_post_image', 'pause_campaign', 'resume_campaign', 'update_budget',
  'show_metrics', 'show_strategy', 'select_ad_account',
  'show_comments', 'reply_comment',
  'analyze_website', 'rethink_strategy',
  'write_creative', 'write_ad_copy', 'general_consultation',
] as const;

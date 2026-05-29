// Two-Key Pattern — even in AUTO mode, high-risk categories require BOTH
// human approval AND an independent secondary check before publish.
//
// "Two-key" because of nuclear-weapon launch protocol: two officers, two keys.
// Single point of failure = no go. Same principle: a single AI classifier
// that mistakenly approves a medical or financial claim could cause a tort.
// Two independent checks reduce that to near-zero.
//
// The two keys for Vigmis:
//   Key 1: Human approval (or first-pass classifier in AUTO mode)
//   Key 2: Independent classifier with a stricter prompt + different temperature
//
// Triggers when:
//   - Tier 1 category in the policy classification (medical, financial,
//     gambling, alcohol, cannabis, political, regulated industries)
//   - Trust tier is 'watch' or 'restricted'
//   - High-stakes claim (price/promise/guarantee) detected

import { route } from '@vigmis/ai-router';
import { db } from '@vigmis/db';
import { classifyContent, type ClassifierInput } from './policy-classifier.js';
import { getTrustTier } from './trust-tier.js';
import type { GateResult } from './policy-gate.js';

const TIER_1_CATEGORIES = new Set([
  'gambling',
  'alcohol',
  'cannabis',
  'cbd',
  'supplement_health_claim',
  'financial_services',
  'investment_advice',
  'medical_service',
  'cosmetic_procedure',
  'legal_service',
  'political_ad',
  'religious_program',
]);

// Categories that ALWAYS get the two-key treatment regardless of classifier output
const ALWAYS_TWO_KEY_KEYWORDS: RegExp[] = [
  /\b(refund|money[\s-]?back)\b/i,
  /\bguarant(ee|y|eed)\b/i,
  /\b(?:save|lose|gain)\s+\$?\d/i,
  /\binvest(ment|ing)?\b/i,
];

const SECOND_PASS_PROMPT = `You are a SECOND opinion classifier. The content below was already approved by a first-pass classifier. Your job is to be the second key — a separate, stricter review specifically focused on high-stakes content.

You are paranoid about:
- Implicit medical claims ("supports immune health", "boosts metabolism")
- Implicit financial promises ("see returns", "build wealth")
- Disguised guarantees ("we never fail", "always works")
- Hidden urgency manipulations
- Anything that could cause regulatory pushback later

Output STRICT JSON:
{
  "approved": true | false,
  "concern": "<short_snake_case_category_or_null>",
  "reason": "<one_sentence>",
  "suggested_rewrite": "<safer_version_or_null>"
}

When in doubt, set approved=false. You are explicitly NOT trying to be helpful or lenient. You are the regulatory-risk filter.`;

export interface TwoKeyDecision {
  required: boolean;       // did this content trigger two-key?
  trigger_reason: string;
  first_pass: 'allowed' | 'blocked';
  second_pass?: 'allowed' | 'blocked';
  second_pass_concern?: string;
  second_pass_reason?: string;
  second_pass_rewrite?: string | null;
  final: 'allow' | 'block' | 'requires_human';
}

export interface TwoKeyInput {
  tenantId: string;
  text: string;
  firstPassResult: GateResult;
  approvalMode: 'auto' | 'review' | 'strict';
  isHighStakes?: boolean;  // caller can hint (e.g. budget changes, brand-new product)
}

export async function evaluateTwoKey(input: TwoKeyInput): Promise<TwoKeyDecision> {
  const trustTier = await getTrustTier(input.tenantId).catch(() => 'standard' as const);
  const trigger = shouldTriggerTwoKey({
    text: input.text,
    firstPassCategory: input.firstPassResult.category,
    firstPassTier: input.firstPassResult.tier,
    trustTier,
    isHighStakes: input.isHighStakes,
  });

  if (!trigger.required) {
    return {
      required: false,
      trigger_reason: 'No two-key triggers matched',
      first_pass: input.firstPassResult.decision === 'block' ? 'blocked' : 'allowed',
      final: input.firstPassResult.decision === 'block' ? 'block' : 'allow',
    };
  }

  // Run the second-pass classifier
  let secondPass: { approved: boolean; concern: string | null; reason: string; suggested_rewrite: string | null } | null = null;
  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: SECOND_PASS_PROMPT,
      prompt: input.text,
      options: { temperature: 0, maxTokens: 300, tenantId: input.tenantId },
    });
    secondPass = parseSecondPassJson(res.output);
  } catch {
    secondPass = null;
  }

  if (!secondPass) {
    // Fail closed — if the second pass fails, require human review.
    return {
      required: true,
      trigger_reason: trigger.reason,
      first_pass: 'allowed',
      second_pass: 'blocked',
      second_pass_concern: 'second_pass_unavailable',
      second_pass_reason: 'Secondary classifier failed; requiring human review',
      final: 'requires_human',
    };
  }

  // If AUTO mode AND second pass approved → final allow
  // If REVIEW/STRICT mode → human review required regardless of second pass
  // If second pass blocked → block + rewrite suggestion
  const isAutoMode = input.approvalMode === 'auto';

  if (!secondPass.approved) {
    return {
      required: true,
      trigger_reason: trigger.reason,
      first_pass: 'allowed',
      second_pass: 'blocked',
      second_pass_concern: secondPass.concern ?? 'second_pass_concern',
      second_pass_reason: secondPass.reason,
      second_pass_rewrite: secondPass.suggested_rewrite,
      final: 'block',
    };
  }

  return {
    required: true,
    trigger_reason: trigger.reason,
    first_pass: 'allowed',
    second_pass: 'allowed',
    final: isAutoMode ? 'allow' : 'requires_human',
  };
}

function shouldTriggerTwoKey(args: {
  text: string;
  firstPassCategory: string;
  firstPassTier: 0 | 1 | 2 | 3;
  trustTier: 'trusted' | 'standard' | 'watch' | 'restricted';
  isHighStakes?: boolean;
}): { required: boolean; reason: string } {
  if (args.firstPassTier === 1) {
    return { required: true, reason: `Tier 1 category '${args.firstPassCategory}' — regulated industry` };
  }
  if (TIER_1_CATEGORIES.has(args.firstPassCategory)) {
    return { required: true, reason: `Category '${args.firstPassCategory}' is regulated` };
  }
  if (args.trustTier === 'watch' || args.trustTier === 'restricted') {
    return { required: true, reason: `Trust tier '${args.trustTier}' requires second-pass review` };
  }
  if (args.isHighStakes) {
    return { required: true, reason: 'High-stakes content (price/promise/guarantee)' };
  }
  for (const kw of ALWAYS_TWO_KEY_KEYWORDS) {
    if (kw.test(args.text)) {
      return { required: true, reason: `Contains high-stakes keyword pattern` };
    }
  }
  return { required: false, reason: '' };
}

function parseSecondPassJson(raw: string): { approved: boolean; concern: string | null; reason: string; suggested_rewrite: string | null } | null {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    if (typeof obj !== 'object' || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.approved !== 'boolean') return null;
    return {
      approved: o.approved,
      concern: typeof o.concern === 'string' ? o.concern : null,
      reason: typeof o.reason === 'string' ? o.reason : '',
      suggested_rewrite: typeof o.suggested_rewrite === 'string' && o.suggested_rewrite.length > 0
        ? o.suggested_rewrite
        : null,
    };
  } catch {
    return null;
  }
}

// Intent Router — classifies every chat message into one of 6 buckets BEFORE
// the chat engine tries to execute actions. The goal is to make "no" useful:
// every refusal has a specific reason and an alternative.
//
// Buckets:
//   1. native_capability    — Vigmis can do this; proceed to existing chat engine
//   2. subscription_gate    — feature exists but plan doesn't include it
//   3. platform_limitation  — Meta/Google/TikTok policy forbids
//   4. legal_block          — illegal in the user's jurisdiction
//   5. ethical_block        — refused by Vigmis content policy
//   6. out_of_scope_adjacent — not a Vigmis feature, but here's a useful pointer
//
// Bucket 1 → execute. Buckets 2–6 → reply with the structured reason; do NOT
// run the action.

import { route } from '@vigmis/ai-router';
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
  // For native_capability: what capability the user wants. Used to fast-path
  // the chat engine without re-asking the LLM.
  capability_hint: string | null;
  model_used: string;
}

const NATIVE_CAPABILITIES = [
  'create_post', 'edit_post', 'approve_post', 'reject_post', 'schedule_post',
  'set_post_image', 'pause_campaign', 'resume_campaign', 'update_budget',
  'show_metrics', 'show_strategy', 'select_ad_account',
  'show_comments', 'reply_comment',
  'analyze_website', 'rethink_strategy',
] as const;

const SYSTEM_PROMPT = `You are Vigmis's intent router. Every customer message goes through you BEFORE the chat engine tries to act. Your job: classify the request into one of 6 buckets and provide a structured response.

The 6 buckets:

1. native_capability — Vigmis natively handles this. Examples: "make a Facebook post about my new product", "pause campaign X", "increase budget for my Google ad", "show me my metrics", "approve this post", "what's my strategy".

2. subscription_gate — Vigmis can do this, but it requires a higher plan. Examples: "run TikTok ads" (Pro plan), "generate 5 video variations" (Pro plan), "weekly competitor scan" (Pro plan).

3. platform_limitation — The customer wants something a platform (Meta/Google/TikTok) forbids. Examples: "post an Instagram-only text post without an image" (IG requires media), "publish to Facebook Marketplace" (no API), "boost a post without ad account" (impossible).

4. legal_block — Illegal in target jurisdiction. Examples: "advertise cannabis to Saudi Arabia", "promote unlicensed financial advice", "run political ads in election blackout window".

5. ethical_block — Forbidden by Vigmis's content policy. Examples: "make an ad attacking my competitor by name", "promise guaranteed weight loss", "say our supplement cures diabetes". The full list is in the Acceptable Use Policy 3-tier system (Tier 0/1/2).

6. out_of_scope_adjacent — Not something Vigmis does, but adjacent enough to be helpful with a pointer. Examples: "draft a press release", "build me a CRM", "send me a legal contract template", "help me hire an employee", "explain accounting".

Output STRICT JSON, no markdown fences:
{
  "bucket": "native_capability" | "subscription_gate" | "platform_limitation" | "legal_block" | "ethical_block" | "out_of_scope_adjacent",
  "reason": "<one short sentence — why this bucket>",
  "user_facing_response": "<what to say back to the customer in their language, friendly, max 2 sentences>",
  "alternative": "<what the customer CAN do instead — null only for native_capability>",
  "capability_hint": "<one of: create_post, edit_post, approve_post, reject_post, schedule_post, set_post_image, pause_campaign, resume_campaign, update_budget, show_metrics, show_strategy, select_ad_account, show_comments, reply_comment, analyze_website, rethink_strategy — or null if not applicable>"
}

Rules:
- For native_capability: capability_hint MUST be one of the listed values. alternative is null.
- Every non-native bucket MUST include an alternative (what they can do instead, or who to ask).
- user_facing_response is the EXACT text we will show the customer. Match their language. No "I'm sorry" preambles — be direct and useful.
- Mirror the customer's language (Hebrew → Hebrew, English → English, etc.).`;

export interface IntentContext {
  tenantId: string;
  message: string;
  pageContext?: string; // e.g., '/dashboard/social'
  subscription?: 'free' | 'basic' | 'pro';
}

export async function classifyIntent(ctx: IntentContext): Promise<IntentClassification> {
  // Layer 1: cheap policy check first. If the message ITSELF is a request to
  // generate forbidden content (Tier 0), short-circuit before the LLM call.
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

  // Layer 2: LLM classifies into the 6 buckets.
  const userPrompt = buildUserPrompt(ctx);
  let raw: string;
  let modelUsed = 'unknown';
  try {
    const res = await route({
      task: 'cheap_task',
      systemPrompt: SYSTEM_PROMPT,
      prompt: userPrompt,
      options: { temperature: 0, maxTokens: 350, tenantId: ctx.tenantId },
    });
    raw = res.output;
    modelUsed = `${res.provider}/${res.model}`;
  } catch {
    // Fail open to native_capability — the existing chat engine has its own guardrails.
    return {
      bucket: 'native_capability',
      reason: 'Router unavailable — falling through to chat engine.',
      user_facing_response: '',
      alternative: null,
      capability_hint: null,
      model_used: 'fallback',
    };
  }

  const parsed = parseClassifierJson(raw);
  if (!parsed) {
    return {
      bucket: 'native_capability',
      reason: 'Router parse error — falling through to chat engine.',
      user_facing_response: '',
      alternative: null,
      capability_hint: null,
      model_used: modelUsed,
    };
  }

  return { ...parsed, model_used: modelUsed };
}

function buildUserPrompt(ctx: IntentContext): string {
  const lines: string[] = [];
  if (ctx.pageContext) lines.push(`CURRENT_PAGE: ${ctx.pageContext}`);
  if (ctx.subscription) lines.push(`SUBSCRIPTION: ${ctx.subscription}`);
  lines.push(`---`);
  lines.push(`MESSAGE:`);
  lines.push(ctx.message);
  return lines.join('\n');
}

function parseClassifierJson(raw: string): Omit<IntentClassification, 'model_used'> | null {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  let obj: unknown;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const bucket = o.bucket;
  const reason = o.reason;
  const userFacing = o.user_facing_response;
  const alternative = o.alternative;
  const capabilityHint = o.capability_hint;

  const valid: IntentBucket[] = ['native_capability','subscription_gate','platform_limitation','legal_block','ethical_block','out_of_scope_adjacent'];
  if (typeof bucket !== 'string' || !valid.includes(bucket as IntentBucket)) return null;
  if (typeof reason !== 'string' || typeof userFacing !== 'string') return null;

  return {
    bucket: bucket as IntentBucket,
    reason,
    user_facing_response: userFacing,
    alternative: typeof alternative === 'string' && alternative.length > 0 ? alternative : null,
    capability_hint: typeof capabilityHint === 'string' && capabilityHint.length > 0 ? capabilityHint : null,
  };
}

export { NATIVE_CAPABILITIES };

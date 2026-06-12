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
  'write_creative', 'write_ad_copy', 'general_consultation',
] as const;

const SYSTEM_PROMPT = `You are Vigmis's intent router. Every customer message goes through you BEFORE the chat engine tries to act. Your job: classify the request into one of 6 buckets and provide a structured response.

The 6 buckets:

1. native_capability — Vigmis natively handles this. This covers a VERY WIDE range of marketing tasks. When in doubt, default to this bucket:
   - Campaign management: "pause campaign X", "increase budget for my Google ad", "resume all campaigns"
   - Creative & copy: "give me 3 creative ideas", "write banner text", "write ad copy", "suggest a CTA", "write a headline", "write ad description", "write a caption", "give me post ideas", "write text for an ad"
   - Social posts: "make a Facebook post about my new product", "approve this post", "schedule this for tomorrow"
   - TikTok: "run TikTok ads", "create a TikTok campaign", "TikTok budget" — TikTok is FULLY SUPPORTED on all plans
   - Analytics & strategy: "show me my metrics", "what's my strategy", "how are my campaigns performing"
   - Consultation: "what should I do to improve my ROAS?", "which platform is best for me?", "analyze my creative", "what would you change?", "what's a good budget?"
   - Geography & budget strategy: "how should I split budget between USA and Israel?", "I have $5000/month — which countries should I target?", "should I advertise in North America and Europe?", "how to allocate budget across territories", "what's the best geo strategy for my budget?" — ANY question about budget distribution across countries or geo targeting is ALWAYS native_capability.

2. subscription_gate — Vigmis can do this, but requires a higher plan. Examples: "generate 5 video variations" (Pro), "weekly competitor scan" (Pro), "automated A/B test across 10 creatives" (Pro). NOTE: TikTok is NOT gated — available on all plans.

3. platform_limitation — The customer wants something a platform (Meta/Google/TikTok) technically forbids. Examples: "post Instagram text-only without image" (IG requires media), "publish to Facebook Marketplace" (no API).

4. legal_block — Illegal in target jurisdiction. Examples: "advertise cannabis to Saudi Arabia", "promote unlicensed financial advice", "run political ads in election blackout window".

5. ethical_block — Forbidden by Vigmis content policy. Examples: "make an ad attacking my competitor by name", "promise guaranteed weight loss", "say our supplement cures diabetes".

6. out_of_scope_adjacent — Not something Vigmis does. Examples: "build me a CRM", "send me a legal contract template", "help me hire an employee", "explain accounting". NOTE: ad copy, creative ideas, CTAs, banner text, headlines are NOT out of scope — they are native_capability.

Output STRICT JSON, no markdown fences:
{
  "bucket": "native_capability" | "subscription_gate" | "platform_limitation" | "legal_block" | "ethical_block" | "out_of_scope_adjacent",
  "reason": "<one short sentence — why this bucket>",
  "user_facing_response": "<what to say back to the customer in their language, friendly, max 2 sentences>",
  "alternative": "<what the customer CAN do instead — null only for native_capability>",
  "capability_hint": "<one of: create_post, edit_post, approve_post, reject_post, schedule_post, set_post_image, pause_campaign, resume_campaign, update_budget, show_metrics, show_strategy, select_ad_account, show_comments, reply_comment, analyze_website, rethink_strategy, write_creative, write_ad_copy, general_consultation — or null if not applicable>"
}

Rules:
- DEFAULT TO native_capability when in doubt. The chat engine has its own guardrails.
- For native_capability: capability_hint MUST be one of the listed values. Use write_creative for creative/copy/CTA/banner requests, general_consultation for advice/questions. alternative is null.
- Every non-native bucket MUST include an alternative.
- user_facing_response is the EXACT text shown to the customer. Match their language. No "I'm sorry" preambles.
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

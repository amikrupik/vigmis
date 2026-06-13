// Policy Classifier — Vigmis Publisher Liability Shield
//
// Classifies a piece of content into the 3-tier policy system before it can
// reach a platform. Two layers:
//
//   1. Fast-path regex/keyword check for clear Tier 0 violations.
//      No LLM call needed — cheap, instant, deterministic.
//   2. LLM-backed nuanced classification for everything else.
//      Catches subtle defamation, misleading claims, dog-whistles, etc.
//
// Output is the same shape regardless of which layer fired:
//   { allowed, tier, category, reason, suggested_rewrite, classifier_version, decided_by, ... }
//
// Every classification is persisted to `content_decisions` by the caller (route).

import { route } from '@vigmis/ai-router';
import crypto from 'crypto';

export const CLASSIFIER_VERSION = 'v1';

export type Tier = 0 | 1 | 2 | 3;
export type Decision =
  | 'allow'
  | 'allow_with_warning'
  | 'block'
  | 'require_human_review'
  | 'rewrite_suggested';

export type ContentKind =
  | 'ad_copy'
  | 'ad_creative'
  | 'post'
  | 'image_prompt'
  | 'video_script'
  | 'landing_claim'
  | 'onboarding_answer'
  | 'chat_message'
  | 'other';

export interface ClassifierInput {
  text: string;
  kind: ContentKind;
  market?: string;              // ISO country code of where the ad will run
  business_country?: string;    // ISO country code of where the customer is based
  industry?: string;            // e.g. 'medical','financial','gambling','cannabis','dating'
}

export interface ClassifierOutput {
  allowed: boolean;
  decision: Decision;
  tier: Tier;
  category: string;
  reason: string;
  suggested_rewrite: string | null;
  classifier_version: string;
  decided_by: 'classifier' | 'human' | 'hybrid';
  model_used: string | null;
  tokens_used: number;
  latency_ms: number;
}

// ─── Tier 0 fast-path patterns ───────────────────────────────────────────────
// Patterns here are matched case-insensitively against the content. Any hit
// instantly blocks without an LLM call. Keep the regexes tight to avoid false
// positives — over-blocking is a UX disaster ("Vigmis refuses everything").

interface Tier0Pattern {
  category: string;
  pattern: RegExp;
  reason: string;
}

const TIER0_PATTERNS: Tier0Pattern[] = [
  // Absolute medical claims
  {
    category: 'medical_claim_absolute',
    pattern: /\b(cures?|guaranteed\s+cure|reverses?\s+(cancer|diabetes|alzheimer)|100%\s+effective)\b/i,
    reason: 'Absolute medical claims are forbidden on all major ad platforms and may violate consumer-protection law.',
  },
  // Hebrew medical absolutes
  {
    category: 'medical_claim_absolute',
    pattern: /(מרפא|ריפוי\s+ודאי|מבטל\s+לחלוטין)\s*(סרטן|סוכרת|אלצהיימר|כל\s+המחלות)/i,
    reason: 'טענות רפואיות מוחלטות אסורות בכל פלטפורמות הפרסום.',
  },
  // Financial guarantee scams
  {
    category: 'financial_guarantee',
    pattern: /\b(guaranteed\s+(returns?|profit|income)|risk[-\s]?free\s+investment|get\s+rich\s+quick|double\s+your\s+money)\b/i,
    reason: 'Guaranteed-returns language is prohibited by financial regulators and ad platforms.',
  },
  {
    category: 'financial_guarantee',
    pattern: /(רווח\s+מובטח|תשואה\s+מובטחת|תתעשר\s+מהר|הכפל\s+את\s+הכסף)/i,
    reason: 'הבטחת תשואה/רווח אסורה לפי רגולציה פיננסית.',
  },
  // Pyramid / MLM red flags
  {
    category: 'pyramid_scheme',
    pattern: /\b(pyramid|matrix\s+plan|recruit\s+\d+\s+people|join\s+my\s+downline)\b/i,
    reason: 'Pyramid-scheme language is illegal in most jurisdictions.',
  },
  // Hate speech triggers (intentionally narrow — broad LLM check covers the rest)
  {
    category: 'hate_speech_explicit',
    pattern: /\b(kill\s+all\s+\w+|death\s+to\s+\w+|\w+\s+should\s+be\s+exterminated)\b/i,
    reason: 'Explicit calls for violence against groups are absolutely prohibited.',
  },
  // Doxxing pattern (ID numbers, full SSN-like)
  {
    category: 'pii_leak',
    pattern: /\b(\d{3}-\d{2}-\d{4}|\d{9})\b.*\b(home|address|lives\s+at)\b/i,
    reason: 'Publishing personal identifiers (national ID/SSN with address) is prohibited.',
  },
  // Drug sales
  {
    category: 'illegal_drug_sale',
    pattern: /\b(buy|sell|order)\s+(cocaine|heroin|meth|mdma|ecstasy|fentanyl|crack)\b/i,
    reason: 'Sale of controlled substances is illegal.',
  },
  // Weapons sales (any — covers licensed dealers too, platform risk)
  {
    category: 'illegal_weapon_sale',
    pattern: /\b(sell|buy|order|purchase|shop|store|dealer|sale|advertis)\w*\b.{0,60}\b(gun|rifle|pistol|handgun|shotgun|firearm|ammunition|ammo|ak-?47|ar-?15|weapon)\b/i,
    reason: 'Advertising firearms or ammunition sales is not permitted on this platform.',
  },
  {
    category: 'illegal_weapon_sale',
    pattern: /\b(ak-?47|ar-?15|glock|beretta|colt|smith\s*&\s*wesson)\b.{0,40}\b(buy|sale|price|order|shop|cheap|discount)\b/i,
    reason: 'Advertising specific firearm models for sale is not permitted.',
  },
  // Marketing to minors of restricted goods
  {
    category: 'minor_targeting_restricted',
    pattern: /\b(kids|children|teens|minors)\b.*\b(alcohol|vape|cigarette|casino|gambling|sports[-\s]?bet)\b/i,
    reason: 'Marketing alcohol/gambling/tobacco to minors is illegal.',
  },
];

// ─── LLM prompt for nuanced classification ───────────────────────────────────

const SYSTEM_PROMPT = `You are Vigmis's content policy classifier. You decide whether a piece of advertising content can be published on Meta/Google/TikTok.

You output STRICT JSON matching this schema and nothing else:
{
  "tier": 0 | 1 | 2 | 3,
  "decision": "allow" | "allow_with_warning" | "block" | "require_human_review" | "rewrite_suggested",
  "category": "<short_snake_case_label>",
  "reason": "<one_short_sentence_explaining_why>",
  "suggested_rewrite": "<safer_wording_or_null>"
}

Tier definitions:
- Tier 0: hard-block. Sale of illegal drugs/weapons, human trafficking, child exploitation, defamation naming specific people/businesses, personal-attack shaming, incitement on protected grounds, pyramid schemes, absolute medical cures, marketing restricted goods to minors, doxxing.
- Tier 1: requires license/human review. Gambling, alcohol, cannabis/CBD, supplements with health claims, financial services, medical services, political ads in election windows.
- Tier 2: allowed with caveats. Dating, adult-adjacent, weight loss, before/after.
- Tier 3: clean. No policy issues.

Decision rules:
- Tier 0 → decision = "block".
- Tier 1 → decision = "require_human_review".
- Tier 2 with fixable issue → decision = "rewrite_suggested" and provide suggested_rewrite.
- Tier 2 clean → decision = "allow_with_warning".
- Tier 3 → decision = "allow".

Also block these even when not Tier 0:
- Defamatory comparisons that name a competitor business (e.g. "better than [Competitor X]" → rewrite to "better than legacy alternatives").
- Health claims without qualifier ("makes you lose 20kg" → rewrite to "supports weight-loss goals when combined with diet").
- Misleading scarcity that isn't substantiated (we cannot verify, so block: "only 3 left" → block unless inventory data backs it).
- Fake urgency ("ENDS TODAY" without an actual end date).

Output ONLY the JSON object. No prose, no markdown fences.`;

// ─── Public API ──────────────────────────────────────────────────────────────

export function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function fastPathCheck(text: string): { hit: Tier0Pattern } | null {
  for (const p of TIER0_PATTERNS) {
    if (p.pattern.test(text)) return { hit: p };
  }
  return null;
}

export async function classifyContent(input: ClassifierInput): Promise<ClassifierOutput> {
  const startedAt = Date.now();

  // Layer 1: fast-path
  const fast = fastPathCheck(input.text);
  if (fast) {
    return {
      allowed: false,
      decision: 'block',
      tier: 0,
      category: fast.hit.category,
      reason: fast.hit.reason,
      suggested_rewrite: null,
      classifier_version: CLASSIFIER_VERSION,
      decided_by: 'classifier',
      model_used: 'fast_path_regex',
      tokens_used: 0,
      latency_ms: Date.now() - startedAt,
    };
  }

  // Layer 2: LLM
  const userPrompt = buildUserPrompt(input);

  let raw: string;
  let modelUsed = 'unknown';
  let tokensUsed = 0;

  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: SYSTEM_PROMPT,
      prompt: userPrompt,
      options: { temperature: 0, maxTokens: 400, tenantId: undefined },
    });
    raw = res.output;
    modelUsed = `${res.provider}/${res.model}`;
    tokensUsed = res.tokensUsed;
  } catch (err) {
    // Fail closed: if the classifier itself fails, require human review rather
    // than letting potentially-harmful content through silently.
    return {
      allowed: false,
      decision: 'require_human_review',
      tier: 1,
      category: 'classifier_unavailable',
      reason: 'Policy classifier is temporarily unavailable. Pausing for human review.',
      suggested_rewrite: null,
      classifier_version: CLASSIFIER_VERSION,
      decided_by: 'classifier',
      model_used: null,
      tokens_used: 0,
      latency_ms: Date.now() - startedAt,
    };
  }

  const parsed = parseClassifierJson(raw);
  if (!parsed) {
    return {
      allowed: false,
      decision: 'require_human_review',
      tier: 1,
      category: 'classifier_parse_error',
      reason: 'Could not parse classifier output. Defaulting to human review.',
      suggested_rewrite: null,
      classifier_version: CLASSIFIER_VERSION,
      decided_by: 'classifier',
      model_used: modelUsed,
      tokens_used: tokensUsed,
      latency_ms: Date.now() - startedAt,
    };
  }

  const allowed = parsed.decision === 'allow' || parsed.decision === 'allow_with_warning';

  return {
    allowed,
    decision: parsed.decision,
    tier: parsed.tier,
    category: parsed.category,
    reason: parsed.reason,
    suggested_rewrite: parsed.suggested_rewrite,
    classifier_version: CLASSIFIER_VERSION,
    decided_by: 'classifier',
    model_used: modelUsed,
    tokens_used: tokensUsed,
    latency_ms: Date.now() - startedAt,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildUserPrompt(input: ClassifierInput): string {
  const lines: string[] = [];
  lines.push(`CONTENT_KIND: ${input.kind}`);
  if (input.market) lines.push(`TARGET_MARKET_COUNTRY: ${input.market}`);
  if (input.business_country) lines.push(`BUSINESS_COUNTRY: ${input.business_country}`);
  if (input.industry) lines.push(`INDUSTRY: ${input.industry}`);
  lines.push(`---`);
  lines.push(`CONTENT:`);
  lines.push(input.text);
  return lines.join('\n');
}

function parseClassifierJson(raw: string): {
  tier: Tier;
  decision: Decision;
  category: string;
  reason: string;
  suggested_rewrite: string | null;
} | null {
  // Strip code fences if the model added them despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;

  const tier = o.tier;
  const decision = o.decision;
  const category = o.category;
  const reason = o.reason;
  const rewrite = o.suggested_rewrite;

  if (
    (tier !== 0 && tier !== 1 && tier !== 2 && tier !== 3) ||
    typeof decision !== 'string' ||
    typeof category !== 'string' ||
    typeof reason !== 'string'
  ) {
    return null;
  }

  const validDecisions: Decision[] = ['allow', 'allow_with_warning', 'block', 'require_human_review', 'rewrite_suggested'];
  if (!validDecisions.includes(decision as Decision)) return null;

  return {
    tier: tier as Tier,
    decision: decision as Decision,
    category,
    reason,
    suggested_rewrite: typeof rewrite === 'string' && rewrite.length > 0 ? rewrite : null,
  };
}

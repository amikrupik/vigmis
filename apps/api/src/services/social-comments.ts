// Social comment management — fetch, triage, reply
//
// v2 (Session 6) — expanded taxonomy + confidence scoring + public/private
// routing + do-not-engage detection + reply policy gate + brand voice.

import { db, decryptToken } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import { sendTenantNotification } from './notify.js';
import { classifyAndLog } from './policy-gate.js';
import { getBrandVoice, brandVoiceInstructions } from './brand-voice.js';
import { checkCommentQuota, recordAiCost } from './usage.js';

// ─── Provocation patterns: fast-path no-engage signal ────────────────────────
// Anyone matching these is a troll/baiter regardless of LLM verdict. Replying
// only feeds the engagement they want.

const PROVOCATION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(scam|fraud|fake|stolen|crooks?)\b.{0,40}\b(you|your|this\s+company)\b/i, reason: 'accusatory_provocation' },
  { pattern: /(נוכל|רמאי|גנב|פושע)/, reason: 'accusatory_provocation_he' },
  { pattern: /^(lol|haha|lmao|🤡|💩|😂\s*😂\s*😂)/i, reason: 'mockery_no_substance' },
  { pattern: /\b(boycott|cancel(led)?|expose|sue)\b/i, reason: 'aggression_signal' },
  { pattern: /\b(i'?m\s+gonna\s+(sue|report)|i'?ll\s+(sue|report))/i, reason: 'litigation_threat' },
];

function detectProvocation(text: string): { is_provocation: boolean; reason: string } {
  for (const p of PROVOCATION_PATTERNS) {
    if (p.pattern.test(text)) return { is_provocation: true, reason: p.reason };
  }
  return { is_provocation: false, reason: '' };
}

// ─── Confidence threshold for auto-reply ─────────────────────────────────────
// Below this, the system NEVER auto-replies. Customer must approve manually.
// "I'm not sure" is a feature — silently posting wrong replies is the failure.

export const AUTO_REPLY_CONFIDENCE_THRESHOLD = 0.85;

const META_VERSION = 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;
const REPLY_COST = 0.05;

// ── Fetch new comments from Meta ──────────────────────────────────────────────

async function getMetaToken(tenantId: string): Promise<string | null> {
  const { data } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .maybeSingle();
  if (!data) return null;
  return decryptToken(data.access_token);
}

async function fetchFacebookComments(postExternalId: string, pageToken: string): Promise<any[]> {
  const res = await fetch(
    `${META_BASE}/${postExternalId}/comments?fields=id,from,message,created_time&limit=50&access_token=${pageToken}`,
  );
  const data = await res.json() as any;
  return data.data ?? [];
}

async function fetchInstagramComments(postExternalId: string, userToken: string): Promise<any[]> {
  const res = await fetch(
    `${META_BASE}/${postExternalId}/comments?fields=id,username,text,timestamp&limit=50&access_token=${userToken}`,
  );
  const data = await res.json() as any;
  return data.data ?? [];
}

// ── AI triage — categorize + draft reply + routing recommendation ─────────────

export type Sentiment =
  | 'positive' | 'question' | 'purchase_intent' | 'lead'
  | 'complaint' | 'angry' | 'troll' | 'hate'
  | 'legal_risk' | 'spam' | 'other';

export type Routing = 'public_reply' | 'private_dm' | 'ignore' | 'hide' | 'escalate';

export interface TriageResult {
  sentiment: Sentiment;
  classifier_confidence: number;     // 0-1
  draftReply: string;
  reply_confidence: number;          // 0-1 (separate from triage)
  routing: Routing;
  recommendation: string;
  do_not_engage: boolean;
  no_engage_reason: string;
}

async function triageComment(
  commentText: string,
  platform: string,
  postContent: string,
  businessContext: string,
  brandVoiceBlock: string,
): Promise<TriageResult & { costUsd: number }> {
  // Fast-path: provocations short-circuit before any LLM call (zero cost).
  const prov = detectProvocation(commentText);
  if (prov.is_provocation) {
    return {
      sentiment: 'troll',
      classifier_confidence: 0.95,
      draftReply: '',
      reply_confidence: 0,
      routing: 'ignore',
      recommendation: `Provocation/troll pattern detected (${prov.reason}). Responding feeds the engagement they want.`,
      do_not_engage: true,
      no_engage_reason: prov.reason,
      costUsd: 0,
    };
  }

  const prompt = `${brandVoiceBlock}

You are a professional social-media community manager for a business.

Business context: ${businessContext}
Platform: ${platform}
Original post excerpt: "${postContent.slice(0, 200)}"
Comment: "${commentText}"

Classify the comment, score your confidence, decide routing, and (if appropriate) draft a reply. Respond ONLY with strict JSON:

{
  "sentiment": "positive" | "question" | "purchase_intent" | "lead" | "complaint" | "angry" | "troll" | "hate" | "legal_risk" | "spam" | "other",
  "classifier_confidence": <0..1>,
  "draft_reply": "<reply in the SAME LANGUAGE as the comment, matching brand voice — or empty string if no reply>",
  "reply_confidence": <0..1>,
  "routing": "public_reply" | "private_dm" | "ignore" | "hide" | "escalate",
  "recommendation": "<one sentence: why this classification + what the business owner should know>",
  "do_not_engage": <true|false>,
  "no_engage_reason": "<short reason or empty>"
}

Taxonomy:
- positive: compliments, praise, emojis, general support
- question: factual ask (hours, ingredients, sizing, how-to)
- purchase_intent: signals readiness to buy (price ask, "interested", "want to order")
- lead: provides contact info or asks for it ("DM me", phone/email shared)
- complaint: dissatisfaction without aggression
- angry: hostile but reformable (de-escalation may help)
- troll: provocative without genuine grievance
- hate: discriminatory or violent against a group
- legal_risk: defamation, accusation, threat of legal action
- spam: unrelated promotion, link spam, bot-like
- other: doesn't fit above

Confidence rules:
- Strong, clear signal → 0.9–1.0
- Ambiguous but reasonable → 0.6–0.85
- Genuinely unclear → ≤0.5
- The system will NOT auto-reply below 0.85; under-confidence is safer than over-confidence.

Routing rules:
- positive / public question → public_reply
- complaint with specifics (order, address, refund) → private_dm + reply suggesting "we've DM'd you"
- purchase_intent / lead → public acknowledgement + private_dm for follow-up
- angry → de-escalate publicly OR ignore if unreformable
- troll / hate → ignore or hide (do_not_engage=true)
- legal_risk → escalate (do_not_engage=true, recommendation starts with "LEGAL:")
- spam → hide (do_not_engage=true)

Reply rules:
- Match the brand voice block exactly. If you cannot, set reply_confidence ≤0.7 so a human reviews.
- For complaint: acknowledge + suggest DM, never argue publicly
- For purchase_intent: factual answer + soft CTA in brand voice
- Never make medical/financial/legal claims
- If unsure of business fact → "Please DM us — we'll confirm" (do not invent)
- Empty draft_reply when do_not_engage=true`;

  try {
    const res = await route({
      task: 'cheap_task',
      prompt,
      options: { maxTokens: 500, temperature: 0.4 },
    });
    const raw = res.output
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const parsed = JSON.parse(raw);
    return { ...normalizeTriage(parsed), costUsd: res.costUsd };
  } catch {
    return {
      sentiment: 'other',
      classifier_confidence: 0,
      draftReply: '',
      reply_confidence: 0,
      routing: 'escalate',
      recommendation: 'Could not triage automatically — please review manually.',
      do_not_engage: false,
      no_engage_reason: '',
      costUsd: 0,
    };
  }
}

function normalizeTriage(o: any): TriageResult {
  const sentiment = (o.sentiment as Sentiment) ?? 'other';
  const routing = (o.routing as Routing) ?? 'public_reply';
  return {
    sentiment,
    classifier_confidence: clamp01(Number(o.classifier_confidence)),
    draftReply: typeof o.draft_reply === 'string' ? o.draft_reply : '',
    reply_confidence: clamp01(Number(o.reply_confidence)),
    routing,
    recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
    do_not_engage: Boolean(o.do_not_engage),
    no_engage_reason: typeof o.no_engage_reason === 'string' ? o.no_engage_reason : '',
  };
}

function clamp01(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ── Reply sender ──────────────────────────────────────────────────────────────

async function sendFacebookReply(commentId: string, message: string, pageToken: string): Promise<string | null> {
  const res = await fetch(`${META_BASE}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageToken }),
  });
  const data = await res.json() as any;
  return data.id ?? null;
}

async function sendInstagramReply(commentId: string, message: string, userToken: string): Promise<string | null> {
  const res = await fetch(`${META_BASE}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: userToken }),
  });
  const data = await res.json() as any;
  return data.id ?? null;
}

async function hideMetaComment(commentId: string, token: string): Promise<void> {
  await fetch(`${META_BASE}/${commentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_hidden: true, access_token: token }),
  });
}

// ── Main cron: fetch all new comments for a tenant ───────────────────────────

export async function fetchCommentsForTenant(tenantId: string): Promise<{ fetched: number; new: number }> {
  const token = await getMetaToken(tenantId);
  if (!token) return { fetched: 0, new: 0 };

  // Get published posts from last 30 days that have external IDs
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts } = await db
    .from('social_posts')
    .select('id, platform, external_post_id, content, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .in('platform', ['facebook', 'instagram'])
    .not('external_post_id', 'is', null)
    .gte('published_at', since);

  if (!posts?.length) return { fetched: 0, new: 0 };

  const { data: clientSettings } = await db
    .from('client_settings')
    .select('website_url, goal, strategy_plan')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const businessContext = clientSettings
    ? `Goal: ${clientSettings.goal}. Website: ${clientSettings.website_url ?? 'not provided'}.`
    : 'Business context unavailable.';

  // Brand voice block — every reply must match the customer's tone.
  const brandVoiceProfile = await getBrandVoice(tenantId).catch(() => null);
  const brandVoiceBlock = brandVoiceInstructions(brandVoiceProfile);

  // Quota / breaker gate — if frozen or out of monthly comment allowance, skip
  // AI triage entirely this run (comments stay for manual handling).
  const quota = await checkCommentQuota(tenantId);
  if (!quota.allowed) return { fetched: 0, new: 0 };
  let triageBudget = quota.remaining;

  let fetched = 0;
  let added = 0;

  for (const post of posts) {
    if (triageBudget <= 0) break;
    if (!post.external_post_id) continue;

    let rawComments: any[] = [];
    try {
      if (post.platform === 'facebook') {
        rawComments = await fetchFacebookComments(post.external_post_id, token);
      } else {
        rawComments = await fetchInstagramComments(post.external_post_id, token);
      }
    } catch { continue; }

    fetched += rawComments.length;

    for (const c of rawComments) {
      if (triageBudget <= 0) break; // monthly comment allowance exhausted
      const externalId = c.id;
      const text = c.message ?? c.text ?? '';
      if (!text.trim()) continue;

      // Skip already seen
      const { data: existing } = await db
        .from('social_comments')
        .select('id')
        .eq('platform', post.platform)
        .eq('external_comment_id', externalId)
        .maybeSingle();
      if (existing) continue;

      // AI triage with brand voice + 10-category taxonomy + confidence + routing
      const triage = await triageComment(text, post.platform, post.content, businessContext, brandVoiceBlock);

      // Meter this handled comment against the monthly allowance + cost breaker.
      triageBudget--;
      await recordAiCost(tenantId, triage.costUsd, { comments: 1 }).catch(() => {});

      // Toxicity / legal gate on the AI's own draft reply. If Vigmis's draft
      // could itself be defamatory or policy-violating, do NOT save it as a
      // viable draft. This stops the AI from agreeing with a customer's
      // accusation against a competitor.
      let replyBlocked = false;
      let safeDraft = triage.draftReply || null;
      if (safeDraft && safeDraft.length > 0) {
        const replyGate = await classifyAndLog({
          tenantId,
          text: safeDraft,
          kind: 'chat_message',
          source: 'pre_flight',
        }).catch(() => null);
        if (replyGate && (replyGate.decision === 'block' || replyGate.decision === 'require_human_review')) {
          replyBlocked = true;
          safeDraft = null;
        }
      }

      // Status decision — built around the confidence threshold + routing.
      // Auto-reply: only positive/question with confidence ≥0.85 AND brand-voice
      //   pass AND not currently configured in the codebase as a default-on
      //   feature. For Session 6 we still funnel to pending_approval but
      //   surface the confidence in the UI so customers can adjust.
      let status: string;
      if (triage.do_not_engage || triage.routing === 'ignore') {
        status = 'no_engage';
      } else if (triage.routing === 'hide') {
        status = 'hidden';
      } else if (triage.routing === 'escalate' || triage.sentiment === 'legal_risk' || triage.sentiment === 'hate') {
        status = 'escalated';
      } else if (replyBlocked) {
        status = 'pending_approval';
      } else if (triage.classifier_confidence < AUTO_REPLY_CONFIDENCE_THRESHOLD || triage.reply_confidence < AUTO_REPLY_CONFIDENCE_THRESHOLD) {
        status = 'pending_approval';
      } else {
        status = 'pending_approval';  // human still in loop by default
      }

      await db.from('social_comments').insert({
        tenant_id: tenantId,
        post_id: post.id,
        platform: post.platform,
        external_comment_id: externalId,
        author_name: c.from?.name ?? c.username ?? null,
        author_id: c.from?.id ?? null,
        text,
        sentiment: triage.sentiment,
        classifier_confidence: triage.classifier_confidence,
        reply_confidence: triage.reply_confidence,
        ai_draft_reply: safeDraft,
        ai_recommendation: triage.recommendation || null,
        routing_recommendation: triage.routing,
        do_not_engage: triage.do_not_engage,
        no_engage_reason: triage.no_engage_reason || null,
        reply_blocked_by_policy: replyBlocked,
        status,
        commented_at: c.created_time ?? c.timestamp ?? new Date().toISOString(),
      });

      added++;
    }
  }

  // Notify if there are complaints or questions
  const { data: urgent } = await db
    .from('social_comments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending_approval')
    .in('sentiment', ['complaint', 'question'])
    .limit(1);

  if (urgent?.length) {
    await sendTenantNotification(
      tenantId,
      'Comments need your attention',
      'There are comments on your social posts that need a response. Vigmis has drafted replies — just approve and send.',
      'warning',
      'Review in Social tab → Comments',
    ).catch(() => {});
  }

  return { fetched, new: added };
}

// ── Send a reply on behalf of the tenant ─────────────────────────────────────

export async function sendCommentReply(
  tenantId: string,
  commentId: string,
  replyText: string,
  options: { editedByClerkUserId?: string } = {},
): Promise<{ success: boolean; externalId?: string }> {
  const { data: comment } = await db
    .from('social_comments')
    .select('*')
    .eq('id', commentId)
    .eq('tenant_id', tenantId)
    .single();

  if (!comment) return { success: false };

  // ── Override learning: if the human edited the AI draft, log the diff.
  // This is the highest-signal feedback for brand voice tuning. We log it
  // regardless of whether the final reply also passes the policy gate, since
  // the edit itself is the data we want to learn from.
  const aiDraft = (comment.ai_draft_reply ?? '').trim();
  const finalReply = replyText.trim();
  if (aiDraft && finalReply && aiDraft !== finalReply) {
    const editDistance = levenshtein(aiDraft, finalReply);
    await db.from('reply_override_log').insert({
      tenant_id: tenantId,
      comment_id: commentId,
      ai_draft: aiDraft,
      human_final: finalReply,
      edit_distance: editDistance,
      edited_by: options.editedByClerkUserId ?? 'unknown',
    }).then(() => null, () => null);
  }

  // ── Final policy gate on the actual bytes about to leave us.
  // The draft was gated at triage time, but the human may have edited it into
  // something risky (defamatory, illegal claim). Re-gate the FINAL reply.
  const finalGate = await classifyAndLog({
    tenantId,
    text: finalReply,
    kind: 'chat_message',
    source: 'post_flight',
  }).catch(() => null);
  if (finalGate && (finalGate.decision === 'block' || finalGate.decision === 'require_human_review')) {
    return { success: false, externalId: undefined };
  }

  const token = await getMetaToken(tenantId);
  if (!token) return { success: false };

  let externalReplyId: string | null = null;

  try {
    if (comment.platform === 'facebook') {
      externalReplyId = await sendFacebookReply(comment.external_comment_id, finalReply, token);
    } else if (comment.platform === 'instagram') {
      externalReplyId = await sendInstagramReply(comment.external_comment_id, finalReply, token);
    }
  } catch (err: any) {
    return { success: false };
  }

  const now = new Date().toISOString();
  await db.from('social_comments').update({
    status: 'sent',
    ai_draft_reply: finalReply,
    replied_at: now,
    external_reply_id: externalReplyId ?? null,
    billed: true,
    cost_usd: REPLY_COST,
    updated_at: now,
  }).eq('id', commentId);

  return { success: true, externalId: externalReplyId ?? undefined };
}

// Lightweight Levenshtein for edit-distance bucketing. Used to filter "trivial"
// edits (typo fixes) from "substantive" rewrites (voice change). Iterative DP.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// ── Hide a spam comment ───────────────────────────────────────────────────────

export async function hideComment(tenantId: string, commentId: string): Promise<boolean> {
  const { data: comment } = await db
    .from('social_comments')
    .select('*')
    .eq('id', commentId)
    .eq('tenant_id', tenantId)
    .single();

  if (!comment) return false;

  const token = await getMetaToken(tenantId);
  if (!token) return false;

  try {
    await hideMetaComment(comment.external_comment_id, token);
    await db.from('social_comments').update({ status: 'hidden', updated_at: new Date().toISOString() }).eq('id', commentId);
    return true;
  } catch {
    return false;
  }
}

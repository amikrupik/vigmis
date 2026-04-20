// Social comment management — fetch, triage, reply

import { db, decryptToken } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import { sendTenantNotification } from './notify.js';

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

// ── AI triage — categorize + draft reply ─────────────────────────────────────

async function triageComment(
  commentText: string,
  platform: string,
  postContent: string,
  businessContext: string,
): Promise<{ sentiment: string; draftReply: string; recommendation: string }> {
  const prompt = `You are a professional social media community manager for a business.

Business context: ${businessContext}
Platform: ${platform}
Original post excerpt: "${postContent.slice(0, 200)}"
Comment: "${commentText}"

Categorize this comment and draft a reply. Respond ONLY with valid JSON:
{
  "sentiment": "positive" | "question" | "complaint" | "spam" | "other",
  "draft_reply": "<a warm, professional reply in the SAME LANGUAGE as the comment>",
  "recommendation": "<one sentence: why this category, and what the business owner should know>"
}

Rules:
- positive: compliments, praise, emojis, general positive reactions
- question: asking about price, hours, product details, availability, how-to
- complaint: expressing dissatisfaction, bad experience, anger
- spam: unrelated promotion, gibberish, bot-like
- other: everything else that doesn't fit above
- For spam: set draft_reply to empty string ""
- For complaint: start recommendation with "URGENT:" and explain why this needs careful handling
- For question: draft_reply should answer using business context if possible, otherwise "Please DM us for details"
- Always reply in the same language as the comment`;

  try {
    const res = await route({
      task: 'cheap_task',
      prompt,
      options: { maxTokens: 400, temperature: 0.4 },
    });
    const parsed = JSON.parse(res.output);
    return {
      sentiment: parsed.sentiment ?? 'other',
      draftReply: parsed.draft_reply ?? '',
      recommendation: parsed.recommendation ?? '',
    };
  } catch {
    return { sentiment: 'other', draftReply: '', recommendation: 'Could not triage automatically.' };
  }
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

  let fetched = 0;
  let added = 0;

  for (const post of posts) {
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

      // AI triage
      const triage = await triageComment(text, post.platform, post.content, businessContext);

      const autoApprove = triage.sentiment === 'positive' && triage.draftReply;
      const status = triage.sentiment === 'spam' ? 'new' : autoApprove ? 'pending_approval' : 'pending_approval';

      await db.from('social_comments').insert({
        tenant_id: tenantId,
        post_id: post.id,
        platform: post.platform,
        external_comment_id: externalId,
        author_name: c.from?.name ?? c.username ?? null,
        author_id: c.from?.id ?? null,
        text,
        sentiment: triage.sentiment,
        ai_draft_reply: triage.draftReply || null,
        ai_recommendation: triage.recommendation || null,
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
): Promise<{ success: boolean; externalId?: string }> {
  const { data: comment } = await db
    .from('social_comments')
    .select('*')
    .eq('id', commentId)
    .eq('tenant_id', tenantId)
    .single();

  if (!comment) return { success: false };

  const token = await getMetaToken(tenantId);
  if (!token) return { success: false };

  let externalReplyId: string | null = null;

  try {
    if (comment.platform === 'facebook') {
      externalReplyId = await sendFacebookReply(comment.external_comment_id, replyText, token);
    } else if (comment.platform === 'instagram') {
      externalReplyId = await sendInstagramReply(comment.external_comment_id, replyText, token);
    }
  } catch (err: any) {
    return { success: false };
  }

  const now = new Date().toISOString();
  await db.from('social_comments').update({
    status: 'sent',
    ai_draft_reply: replyText,
    replied_at: now,
    external_reply_id: externalReplyId ?? null,
    billed: true,
    cost_usd: REPLY_COST,
    updated_at: now,
  }).eq('id', commentId);

  return { success: true, externalId: externalReplyId ?? undefined };
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

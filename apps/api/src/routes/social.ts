// Social Media Management Routes
//
// GET  /social/settings                — get social settings for this tenant
// PUT  /social/settings                — update settings (platforms, approval_mode, etc.)
// GET  /social/posts                   — list posts (all statuses)
// GET  /social/posts/:id               — single post
// POST /social/posts/:id/approve       — client approves (with optional edit)
// POST /social/posts/:id/reject        — client rejects
// POST /social/generate                — manually trigger content generation for next week
// POST /social/cron/weekly             — cron: generate + schedule weekly posts (all tenants)
// POST /social/cron/publish            — cron: publish scheduled approved posts
// GET  /social/analytics               — aggregate engagement overview
// GET  /social/comments                — list comments needing attention
// POST /social/comments/:id/send       — send AI-drafted (or edited) reply
// POST /social/comments/:id/ignore     — mark as ignored (no reply needed)
// POST /social/comments/:id/hide       — hide spam/offensive comment on platform
// POST /social/cron/comments           — cron: fetch new comments for all tenants

import type { FastifyInstance } from 'fastify';
import { db, decryptToken } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { generateSocialContent } from '../services/social-content.js';
import { publishSocialPost } from '../services/social-publisher.js';
import { sendTenantNotification } from '../services/notify.js';
import { createProtocol } from './protocols.js';
import { fetchCommentsForTenant, sendCommentReply, hideComment } from '../services/social-comments.js';

export async function socialRoutes(app: FastifyInstance) {

  // ── Settings ──────────────────────────────────────────────────────────────
  app.get('/social/settings', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db
      .from('social_settings')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    return reply.send({ settings: data ?? null });
  });

  app.put('/social/settings', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as any;
    await db.from('social_settings').upsert(
      { tenant_id: request.tenantId, ...body, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );
    return reply.send({ success: true });
  });

  // ── Posts list ────────────────────────────────────────────────────────────
  app.get('/social/posts', { preHandler: authenticate }, async (request, reply) => {
    const { status, platform, limit = 20 } = request.query as any;
    let q = db
      .from('social_posts')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .order('scheduled_for', { ascending: false })
      .limit(Number(limit));

    if (status) q = q.eq('status', status);
    if (platform) q = q.eq('platform', platform);

    const { data } = await q;
    return reply.send({ posts: data ?? [] });
  });

  // ── Single post ───────────────────────────────────────────────────────────
  app.get('/social/posts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { data } = await db
      .from('social_posts')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();
    if (!data) return reply.code(404).send({ error: 'Not found' });
    return reply.send(data);
  });

  // ── Approve (with optional edit + scheduling control) ────────────────────
  // Body shape:
  //   { edited_content?, publish_now?: true, scheduled_for?: ISO string }
  // - publish_now=true: publish immediately via the platform API, mark as published.
  // - scheduled_for: ISO datetime — schedule for that time (cron picks it up).
  // - neither: keep the original scheduled_for (weekly slot).
  app.post('/social/posts/:id/approve', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { edited_content, publish_now, scheduled_for } = request.body as any;

    const { data: post } = await db
      .from('social_posts')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!post) return reply.code(404).send({ error: 'Not found' });
    if (post.status === 'published') return reply.send({ success: true, alreadyPublished: true });

    const update: any = {
      status: 'approved',
      updated_at: new Date().toISOString(),
    };
    if (edited_content?.trim()) update.client_edit = edited_content.trim();

    // Honour a client-chosen schedule
    if (!publish_now && scheduled_for) {
      const dt = new Date(scheduled_for);
      if (isNaN(dt.getTime())) {
        return reply.code(400).send({ error: 'scheduled_for must be a valid ISO datetime' });
      }
      update.scheduled_for = dt.toISOString();
    }

    // For publish-now, mark scheduled_for to now so the cron / publish call is consistent
    if (publish_now) {
      update.scheduled_for = new Date().toISOString();
    }

    await db.from('social_posts').update(update).eq('id', id);

    // Publish immediately
    let publishResult: { success: boolean; externalId?: string; error?: string } | null = null;
    if (publish_now) {
      try {
        const { publishSocialPost } = await import('../services/social-publisher.js');
        const merged = { ...post, ...update, content: update.client_edit ?? post.client_edit ?? post.content };
        publishResult = await publishSocialPost(merged);
        const now = new Date().toISOString();
        if (publishResult.success) {
          await db.from('social_posts').update({
            status: 'published',
            external_post_id: publishResult.externalId ?? null,
            published_at: now,
            billed: true,
            updated_at: now,
          }).eq('id', id);
        } else {
          await db.from('social_posts').update({ status: 'failed', updated_at: now }).eq('id', id);
        }
      } catch (err) {
        request.log.error({ err }, 'publish_now failed');
        publishResult = { success: false, error: err instanceof Error ? err.message : 'publish failed' };
      }
    }

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: publish_now ? 'social.post_published_immediately' : 'social.post_approved',
      platform: post.platform,
      actor: 'user',
      payload: {
        postId: id,
        platform: post.platform,
        edited: !!edited_content,
        scheduled_for: update.scheduled_for ?? post.scheduled_for,
        publish_now: !!publish_now,
        publish_success: publish_now ? publishResult?.success : undefined,
      },
    });

    return reply.send({
      success: publish_now ? (publishResult?.success ?? false) : true,
      published: publish_now && publishResult?.success === true,
      scheduled_for: update.scheduled_for ?? post.scheduled_for,
      publishError: publishResult?.error,
    });
  });

  // ── Patch (edit content / image / schedule on any non-published post) ────
  app.patch('/social/posts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { content, image_url, scheduled_for } = request.body as any;

    const { data: post } = await db.from('social_posts')
      .select('id, status, platform')
      .eq('id', id).eq('tenant_id', request.tenantId).single();
    if (!post) return reply.code(404).send({ error: 'Not found' });
    if (post.status === 'published') {
      return reply.code(400).send({ error: 'Cannot edit a published post — delete it and create a new one.' });
    }

    const update: any = { updated_at: new Date().toISOString() };
    if (typeof content === 'string' && content.trim()) {
      update.content = content.trim();
      update.client_edit = content.trim();
    }
    if (typeof image_url === 'string') {
      update.image_url = image_url.trim() || null;
    }
    if (scheduled_for) {
      const dt = new Date(scheduled_for);
      if (isNaN(dt.getTime())) return reply.code(400).send({ error: 'scheduled_for must be valid ISO datetime' });
      update.scheduled_for = dt.toISOString();
    }

    await db.from('social_posts').update(update).eq('id', id);
    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'social.post_edited',
      platform: post.platform,
      actor: 'user',
      payload: { postId: id, fields: Object.keys(update).filter(k => k !== 'updated_at') },
    });
    return reply.send({ success: true });
  });

  // ── Delete (any post — published is removed from our DB only, not from the platform) ──
  app.delete('/social/posts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { data: post } = await db.from('social_posts')
      .select('id, platform, status, external_post_id')
      .eq('id', id).eq('tenant_id', request.tenantId).single();
    if (!post) return reply.code(404).send({ error: 'Not found' });

    await db.from('social_posts').delete().eq('id', id);
    // Cascade also removes analytics row via FK.

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'social.post_deleted',
      platform: post.platform,
      actor: 'user',
      payload: {
        postId: id,
        wasPublished: post.status === 'published',
        external_post_id: post.external_post_id,
        // We deliberately don't delete from Meta automatically — that needs an explicit
        // "Delete on Facebook/Instagram" action with the user's confirmation.
      },
    });
    return reply.send({ success: true });
  });

  // ── Reject ────────────────────────────────────────────────────────────────
  app.post('/social/posts/:id/reject', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { reason } = request.body as any;

    await db.from('social_posts')
      .update({ status: 'rejected', rejected_reason: reason ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', request.tenantId);

    return reply.send({ success: true });
  });

  // ── Manual generate ───────────────────────────────────────────────────────
  app.post('/social/generate', { preHandler: authenticate }, async (request, reply) => {
    try {
      const result = await generateWeeklyPostsForTenant(request.tenantId);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err, tenantId: request.tenantId }, 'Social generate failed');
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Generation failed' });
    }
  });

  // ── Analytics overview ────────────────────────────────────────────────────
  app.get('/social/analytics', { preHandler: authenticate }, async (request, reply) => {
    const { data: posts } = await db
      .from('social_posts')
      .select('id, platform, pillar, published_at, cost_usd')
      .eq('tenant_id', request.tenantId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50);

    const { data: analytics } = await db
      .from('social_analytics')
      .select('post_id, platform, likes, comments, shares, reach, impressions, engagement_rate')
      .eq('tenant_id', request.tenantId)
      .order('fetched_at', { ascending: false });

    const analyticsByPost = Object.fromEntries(
      (analytics ?? []).map((a: any) => [a.post_id, a])
    );

    const enriched = (posts ?? []).map((p: any) => ({
      ...p,
      analytics: analyticsByPost[p.id] ?? null,
    }));

    const totalSpend = (posts ?? []).reduce((s: number, p: any) => s + (p.cost_usd ?? 0), 0);
    const totalReach = (analytics ?? []).reduce((s: number, a: any) => s + (a.reach ?? 0), 0);

    return reply.send({
      posts: enriched,
      summary: {
        totalPublished: posts?.length ?? 0,
        totalSpendUsd: totalSpend,
        totalReach,
      },
    });
  });

  // ── Cron: weekly generation ───────────────────────────────────────────────
  app.post('/social/cron/weekly', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { data: activeTenants } = await db
      .from('social_settings')
      .select('tenant_id')
      .eq('enabled', true);

    if (!activeTenants?.length) return reply.send({ processed: 0 });

    let processed = 0;
    for (const row of activeTenants) {
      try {
        await generateWeeklyPostsForTenant(row.tenant_id);
        processed++;
      } catch (err) {
        console.error(`Social generation failed for tenant ${row.tenant_id}:`, err);
      }
    }

    return reply.send({ processed });
  });

  // ── Cron: publish scheduled posts ─────────────────────────────────────────
  app.post('/social/cron/publish', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const now = new Date().toISOString();

    // Posts approved and scheduled for now or earlier
    const { data: due } = await db
      .from('social_posts')
      .select('*')
      .eq('status', 'approved')
      .lte('scheduled_for', now);

    if (!due?.length) return reply.send({ published: 0 });

    let published = 0;
    for (const post of due) {
      try {
        const result = await publishSocialPost(post);
        if (result.success) {
          await db.from('social_posts').update({
            status: 'published',
            external_post_id: result.externalId ?? null,
            published_at: now,
            billed: true,
            updated_at: now,
          }).eq('id', post.id);

          published++;
        } else {
          await db.from('social_posts').update({ status: 'failed', updated_at: now }).eq('id', post.id);
        }
      } catch {
        await db.from('social_posts').update({ status: 'failed', updated_at: now }).eq('id', post.id);
      }
    }

    // Check posts past approval timeout — send reminder
    const { data: settings } = await db
      .from('social_settings')
      .select('tenant_id, approval_timeout_hours')
      .eq('enabled', true);

    for (const s of settings ?? []) {
      const timeoutHours = s.approval_timeout_hours ?? 24;
      const cutoff = new Date(Date.now() - timeoutHours * 60 * 60 * 1000).toISOString();
      const { data: timedOut } = await db
        .from('social_posts')
        .select('id, platform')
        .eq('tenant_id', s.tenant_id)
        .eq('status', 'pending_approval')
        .lte('created_at', cutoff)
        .limit(5);

      if (timedOut?.length) {
        await sendTenantNotification(
          s.tenant_id,
          'Social posts waiting for approval',
          `${timedOut.length} post${timedOut.length > 1 ? 's' : ''} have been waiting more than ${timeoutHours} hours. Approve or reject in your Social tab to keep your schedule.`,
          'warning',
          'Review in Social tab',
        ).catch(() => {});
      }
    }

    return reply.send({ published });
  });

  // ── Cron: fetch engagement analytics for published posts ──────────────────
  app.post('/social/cron/analytics', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { data: activeTenants } = await db
      .from('social_settings')
      .select('tenant_id')
      .eq('enabled', true);

    if (!activeTenants?.length) return reply.send({ processed: 0 });

    let processed = 0;
    for (const row of activeTenants) {
      try {
        await fetchEngagementForTenant(row.tenant_id);
        processed++;
      } catch (err) {
        console.error(`Analytics fetch failed for tenant ${row.tenant_id}:`, err);
      }
    }

    return reply.send({ processed });
  });

  // ── Comments list ─────────────────────────────────────────────────────────
  app.get('/social/comments', { preHandler: authenticate }, async (request, reply) => {
    const { status, sentiment, limit = 50 } = request.query as any;
    let q = db
      .from('social_comments')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .order('commented_at', { ascending: false })
      .limit(Number(limit));

    if (status) q = q.eq('status', status);
    if (sentiment) q = q.eq('sentiment', sentiment);

    const { data } = await q;
    return reply.send({ comments: data ?? [] });
  });

  // ── Send reply ────────────────────────────────────────────────────────────
  app.post('/social/comments/:id/send', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { reply_text } = request.body as any;

    if (!reply_text?.trim()) return reply.code(400).send({ error: 'reply_text required' });

    const result = await sendCommentReply(request.tenantId, id, reply_text.trim());
    if (!result.success) return reply.code(500).send({ error: 'Failed to send reply' });

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'social.comment_replied',
      actor: 'user',
      payload: { commentId: id, externalReplyId: result.externalId ?? null },
    });

    return reply.send({ success: true, externalId: result.externalId });
  });

  // ── Ignore comment ────────────────────────────────────────────────────────
  app.post('/social/comments/:id/ignore', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    await db.from('social_comments')
      .update({ status: 'ignored', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', request.tenantId);
    return reply.send({ success: true });
  });

  // ── Hide comment on platform ──────────────────────────────────────────────
  app.post('/social/comments/:id/hide', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const ok = await hideComment(request.tenantId, id);
    if (!ok) return reply.code(500).send({ error: 'Could not hide comment' });
    return reply.send({ success: true });
  });

  // ── Cron: fetch new comments for all tenants ──────────────────────────────
  app.post('/social/cron/comments', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { data: activeTenants } = await db
      .from('social_settings')
      .select('tenant_id')
      .eq('enabled', true);

    if (!activeTenants?.length) return reply.send({ processed: 0, fetched: 0, new: 0 });

    let processed = 0;
    let totalFetched = 0;
    let totalNew = 0;

    for (const row of activeTenants) {
      try {
        const result = await fetchCommentsForTenant(row.tenant_id);
        totalFetched += result.fetched;
        totalNew += result.new;
        processed++;
      } catch (err) {
        console.error(`Comment fetch failed for tenant ${row.tenant_id}:`, err);
      }
    }

    return reply.send({ processed, fetched: totalFetched, new: totalNew });
  });
}

// ── Weekly generation logic ───────────────────────────────────────────────────

async function generateWeeklyPostsForTenant(tenantId: string): Promise<{ generated: number; skipped: number }> {
  const { data: settings } = await db
    .from('social_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .maybeSingle();

  if (!settings) return { generated: 0, skipped: 0 };

  const { data: clientSettings } = await db
    .from('client_settings')
    .select('website_url, website_analysis, goal, strategy_plan')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Build the active-platforms list. Prefer the explicit JSONB array; fall back to
  // the top-level facebook_page_id / instagram_user_id columns when the array is
  // missing or empty (older tenants set up before the JSONB array was populated).
  let platforms: any[] = (settings.platforms ?? []).filter((p: any) => p.enabled !== false);
  if (!platforms.length) {
    const inferred: any[] = [];
    if (settings.facebook_page_id) inferred.push({ platform: 'facebook', enabled: true, page_id: settings.facebook_page_id });
    if (settings.instagram_user_id) inferred.push({ platform: 'instagram', enabled: true, page_id: settings.instagram_user_id });
    platforms = inferred;
  }
  if (!platforms.length) return { generated: 0, skipped: 0 };

  const pillars: string[] = settings.content_pillars ?? ['educational', 'promotional', 'social_proof'];
  const pillarIndex = settings.active_pillar_index ?? 0;
  const thisPillar = pillars[pillarIndex % pillars.length];

  // Next Monday at optimal time per platform
  const nextMonday = getNextMonday();

  let generated = 0;
  let skipped = 0;

  for (const platformConfig of platforms) {
    const { platform } = platformConfig;

    // Don't generate if already have a post scheduled this week for this platform
    const weekStart = new Date(nextMonday);
    weekStart.setDate(weekStart.getDate() - 1);
    const weekEnd = new Date(nextMonday);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const { data: existing } = await db
      .from('social_posts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('platform', platform)
      .gte('scheduled_for', weekStart.toISOString())
      .lte('scheduled_for', weekEnd.toISOString())
      .not('status', 'in', ['rejected', 'failed'])
      .limit(1);

    if (existing?.length) { skipped++; continue; }

    try {
      const content = await generateSocialContent({
        tenantId,
        platform,
        pillar: thisPillar,
        websiteUrl: clientSettings?.website_url ?? undefined,
        websiteAnalysis: clientSettings?.website_analysis ?? undefined,
        goal: clientSettings?.goal ?? 'leads',
        strategyPlan: clientSettings?.strategy_plan ?? undefined,
        brandVoice: settings.brand_voice ?? undefined,
      });

      const scheduledFor = getOptimalPostTime(platform, nextMonday);
      const costUsd = platform === 'tiktok' ? 3.00 : 1.00;

      const { data: post } = await db.from('social_posts').insert({
        tenant_id: tenantId,
        platform,
        pillar: thisPillar,
        status: settings.approval_mode === 'auto' ? 'approved' : 'pending_approval',
        content: content.text,
        hashtags: content.hashtags,
        image_url: content.imageUrl ?? null,
        video_url: content.videoUrl ?? null,
        scheduled_for: scheduledFor.toISOString(),
        cost_usd: costUsd,
      }).select('id').single();

      if (post && settings.approval_mode !== 'auto') {
        await sendTenantNotification(
          tenantId,
          `New ${platform} post ready for review`,
          `Vigmis has prepared a ${platform} post for this week (${thisPillar} content). Review and approve in your Social tab.`,
          'warning',
          'Review in Social tab',
        ).catch(() => {});
      }

      generated++;
    } catch (err) {
      console.error(`Social content generation failed for tenant ${tenantId}, platform ${platform}:`, err);
      skipped++;
    }
  }

  // Advance pillar index for next week
  await db.from('social_settings').update({
    active_pillar_index: (pillarIndex + 1) % pillars.length,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId);

  return { generated, skipped };
}

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getOptimalPostTime(platform: string, baseDate: Date): Date {
  const d = new Date(baseDate);
  const hours: Record<string, number> = {
    facebook: 10,
    instagram: 11,
    tiktok: 19,
  };
  d.setHours(hours[platform] ?? 10, 0, 0, 0);
  return d;
}

// ── Engagement analytics fetch ────────────────────────────────────────────────

const META_VERSION = 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

async function fetchEngagementForTenant(tenantId: string): Promise<void> {
  const { data: tokenRow } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .maybeSingle();

  if (!tokenRow) return;

  const token = decryptToken(tokenRow.access_token);

  // Posts published in the last 7 days with external IDs on Meta
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts } = await db
    .from('social_posts')
    .select('id, platform, external_post_id, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .in('platform', ['facebook', 'instagram'])
    .not('external_post_id', 'is', null)
    .gte('published_at', since);

  if (!posts?.length) return;

  const now = new Date().toISOString();

  for (const post of posts) {
    if (!post.external_post_id) continue;

    try {
      let likes = 0, comments = 0, shares = 0, reach = 0, impressions = 0;

      if (post.platform === 'facebook') {
        const res = await fetch(
          `${META_BASE}/${post.external_post_id}?fields=likes.summary(true),comments.summary(true),shares&access_token=${token}`,
        );
        const d = await res.json() as any;
        likes = d.likes?.summary?.total_count ?? 0;
        comments = d.comments?.summary?.total_count ?? 0;
        shares = d.shares?.count ?? 0;
      } else if (post.platform === 'instagram') {
        const res = await fetch(
          `${META_BASE}/${post.external_post_id}?fields=like_count,comments_count,reach,impressions&access_token=${token}`,
        );
        const d = await res.json() as any;
        likes = d.like_count ?? 0;
        comments = d.comments_count ?? 0;
        reach = d.reach ?? 0;
        impressions = d.impressions ?? 0;
      }

      const total = likes + comments + shares;
      const engagementRate = impressions > 0 ? Math.round((total / impressions) * 10000) / 100 : null;

      await db.from('social_analytics').upsert({
        tenant_id: tenantId,
        post_id: post.id,
        platform: post.platform,
        likes,
        comments,
        shares,
        reach,
        impressions,
        engagement_rate: engagementRate,
        fetched_at: now,
      }, { onConflict: 'post_id' });

      // If reach > threshold, suggest boosting
      if (reach > 500 || likes > 20) {
        await sendTenantNotification(
          tenantId,
          'Top-performing post — boost it?',
          `Your ${post.platform} post is getting great organic reach (${reach > 0 ? reach + ' reach' : likes + ' likes'}). Consider turning it into a paid ad for even more results.`,
          'warning',
          'View in Social tab',
        ).catch(() => {});
      }
    } catch { continue; }
  }
}

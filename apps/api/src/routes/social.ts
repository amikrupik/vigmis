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
import { assertCronSecret } from '../middleware/secrets.js';
import { generateSocialContent } from '../services/social-content.js';
import { publishSocialPost } from '../services/social-publisher.js';
import { sendTenantNotification } from '../services/notify.js';
import { createProtocol } from './protocols.js';
import { fetchCommentsForTenant, sendCommentReply, hideComment } from '../services/social-comments.js';
import { classifyAndLog } from '../services/policy-gate.js';
import { captureApprovalSnapshot } from '../services/approval-snapshot.js';
import { evaluateTwoKey } from '../services/two-key.js';
import { buildPostsIntelligence } from '../services/posts-intelligence.js';
import { getTrustTier, actionGateForTier } from '../services/trust-tier.js';
import { detectHighStakes } from '../services/high-stakes-detector.js';
import { checkIndustryGate } from '../services/industry-gates.js';
import { isFrozenFor } from './admin.js';
import { route } from '@vigmis/ai-router';

const COOLING_OFF_MINUTES = 60;

// ── Territory → language resolution ──────────────────────────────────────────
// Maps common territory names/codes to ISO 639-1 language codes.
// When a business targets a specific country, posts are written in that country's
// primary language so locals can read them naturally.
const TERRITORY_LANG: Record<string, string> = {
  il: 'he', israel: 'he', ישראל: 'he',
  us: 'en', usa: 'en', 'united states': 'en', america: 'en',
  uk: 'en', 'united kingdom': 'en', england: 'en', britain: 'en',
  ca: 'en', canada: 'en',
  au: 'en', australia: 'en',
  ae: 'ar', uae: 'ar', 'united arab emirates': 'ar', dubai: 'ar', 'abu dhabi': 'ar',
  sa: 'ar', 'saudi arabia': 'ar', ksa: 'ar',
  jo: 'ar', jordan: 'ar',
  eg: 'ar', egypt: 'ar',
  de: 'de', germany: 'de', deutschland: 'de',
  fr: 'fr', france: 'fr',
  es: 'es', spain: 'es',
  mx: 'es', mexico: 'es',
  it: 'it', italy: 'it',
  pt: 'pt', portugal: 'pt',
  br: 'pt', brazil: 'pt',
  ru: 'ru', russia: 'ru',
  nl: 'nl', netherlands: 'nl', holland: 'nl',
  pl: 'pl', poland: 'pl',
  tr: 'tr', turkey: 'tr', türkiye: 'tr',
  ro: 'ro', romania: 'ro',
  hu: 'hu', hungary: 'hu',
  cz: 'cs', 'czech republic': 'cs',
  gr: 'el', greece: 'el',
};

/** Resolve the language posts should be written in for this tenant.
 *  Priority: explicit content_language setting → primary geo_include → null (fall back to website detection) */
function resolvePostLanguage(geoInclude: string[], explicitLang?: string | null): string | null {
  if (explicitLang && explicitLang !== 'auto') return explicitLang;
  if (!geoInclude?.length) return null;
  // Use the first listed territory as the primary market
  const key = geoInclude[0].toLowerCase().trim();
  return TERRITORY_LANG[key] ?? null;
}

/** Generate a brief translation of a foreign-language post so the business owner
 *  (who may not speak the post language) can review and approve it.
 *  Returns null on any error — caller decides whether to skip or retry. */
async function generateTranslation(
  postText: string,
  fromLang: string,
  toLang: 'he' | 'en',
): Promise<string | null> {
  try {
    const toLangName = toLang === 'he' ? 'Hebrew' : 'English';
    const res = await route({
      task: 'analysis',
      prompt: `Translate this social media post to ${toLangName} in 1-3 sentences. Keep the meaning accurate but be concise — this is just so the business owner can understand what was written in ${fromLang} before approving it.\n\nPost:\n${postText.slice(0, 600)}`,
      options: { maxTokens: 300, temperature: 0.1 },
    });
    return res.output.trim().replace(/^(Translation:|Here is|Here's|This is):?\s*/i, '') || null;
  } catch {
    return null;
  }
}

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
    const allowed = ['approval_mode', 'auto_post_enabled', 'posting_frequency', 'preferred_times', 'whatsapp', 'email', 'email_enabled', 'whatsapp_enabled'];
    const filtered = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    await db.from('social_settings').upsert(
      { tenant_id: request.tenantId, ...filtered, updated_at: new Date().toISOString() },
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
    if (post.status === 'approved' || post.status === 'cooling_off') return reply.send({ success: true, alreadyApproved: true });

    // Admin freeze gate — Vigmis-internal hard stop.
    const frozen = await isFrozenFor(request.tenantId, 'publish');
    if (frozen.frozen) {
      return reply.code(423).send({
        error: 'tenant_frozen',
        capability: 'publish',
        reason: frozen.reason,
      });
    }

    // Trust Tier gate — restricted tenants cannot auto-publish.
    const tier = await getTrustTier(request.tenantId).catch(() => 'standard' as const);
    const tierGate = actionGateForTier(tier, publish_now ? 'auto_publish' : 'high_stakes_publish');
    if (!tierGate.allow) {
      return reply.code(403).send({
        error: 'trust_tier_blocked',
        tier,
        reason: tierGate.reason,
      });
    }

    // Final content the customer is approving (edits applied if present).
    const finalText: string = edited_content?.trim() || post.client_edit?.trim() || post.content;

    // ── Post-flight policy gate ────────────────────────────────────────────
    // Customer may have edited the content since pre-flight at generation time.
    // Re-classify the FINAL bytes before we record approval or publish.
    const gate = await classifyAndLog({
      tenantId: request.tenantId,
      text: finalText,
      kind: 'post',
      source: 'post_flight',
    });
    if (gate.decision === 'block' || gate.decision === 'require_human_review') {
      await db.from('social_posts').update({
        status: 'blocked_by_policy',
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('tenant_id', request.tenantId);
      return reply.code(422).send({
        error: 'policy_blocked',
        decision_id: gate.decision_id,
        category: gate.category,
        reason: gate.reason,
        suggested_rewrite: gate.suggested_rewrite,
        tier: gate.tier,
      });
    }

    // Industry compliance gate — block regulated content without proper license attestation.
    const industryGate = await checkIndustryGate({ tenantId: request.tenantId, text: finalText });
    if (industryGate.blocked) {
      return reply.code(412).send({
        error: 'industry_attestation_required',
        industry: industryGate.detected_industry,
        required_license: industryGate.required_license,
        reason: industryGate.reason,
      });
    }

    // Two-Key — high-stakes content needs a second-pass classifier even after
    // the first pass approved. Fetches approval_mode from social_settings.
    const { data: socSettings } = await db.from('social_settings')
      .select('approval_mode')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    const approvalMode = (socSettings?.approval_mode as 'auto' | 'review' | 'strict' | undefined) ?? 'review';
    const twoKey = await evaluateTwoKey({
      tenantId: request.tenantId,
      text: finalText,
      firstPassResult: gate,
      approvalMode,
      isHighStakes: publish_now === true,
    });
    if (twoKey.final === 'block') {
      await db.from('social_posts').update({
        status: 'blocked_by_policy',
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('tenant_id', request.tenantId);
      return reply.code(422).send({
        error: 'two_key_blocked',
        trigger: twoKey.trigger_reason,
        concern: twoKey.second_pass_concern,
        reason: twoKey.second_pass_reason,
        suggested_rewrite: twoKey.second_pass_rewrite,
      });
    }
    if (twoKey.final === 'requires_human' && publish_now) {
      // AUTO would have published — but two-key forces a human review pause.
      return reply.code(409).send({
        error: 'requires_human_review',
        trigger: twoKey.trigger_reason,
        message: 'This content category requires a second human approval before publishing. Toggle off "publish now" and approve from the dashboard.',
      });
    }

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

    // ── Forensic approval snapshot ────────────────────────────────────────
    // Captures exactly what the customer approved, before we touch status.
    const snapshot = await captureApprovalSnapshot({
      tenantId: request.tenantId,
      clerkUserId: request.clerkUserId,
      subjectKind: 'social_post',
      subjectId: id,
      contentSnapshot: {
        platform: post.platform,
        content: finalText,
        image_url: post.image_url ?? null,
        video_url: post.video_url ?? null,
        hashtags: post.hashtags ?? [],
        scheduled_for: update.scheduled_for ?? post.scheduled_for ?? null,
      },
      approvalMethod: publish_now ? 'web_click' : 'web_click',
      clientIp: request.ip ?? null,
      userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
      relatedDecisionId: gate.decision_id ?? null,
    }).catch((err) => {
      request.log.error({ err, postId: id }, 'approval snapshot failed; continuing');
      return null;
    });

    // Pre-publish cooling-off — for high-stakes claims (price/promise/
    // guarantee) we delay publish by COOLING_OFF_MINUTES even when the
    // customer hit "publish now". Gives them a chance to cancel.
    const highStakes = detectHighStakes(finalText);
    if (publish_now && highStakes.is_high_stakes) {
      const coolingUntil = new Date(Date.now() + COOLING_OFF_MINUTES * 60_000).toISOString();
      update.status = 'cooling_off';
      update.cooling_off_until = coolingUntil;
      update.cooling_off_labels = highStakes.labels;
      update.cooling_off_cancelled = false;
      await db.from('social_posts').update(update).eq('id', id).eq('tenant_id', request.tenantId);

      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'social.cooling_off_started',
        platform: post.platform,
        actor: 'user',
        payload: { postId: id, labels: highStakes.labels, until: coolingUntil },
      });

      return reply.send({
        success: true,
        cooling_off: true,
        cooling_off_until: coolingUntil,
        labels: highStakes.labels,
        message: `Publishing in ${COOLING_OFF_MINUTES} minutes. You can cancel from the Comments tab anytime before then.`,
      });
    }

    // Conditional update: only proceed if post is still in a pre-approval state.
    // This prevents double-publish from concurrent approve requests.
    const { data: locked } = await db
      .from('social_posts')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .not('status', 'in', '("approved","published","cooling_off","blocked_by_policy")')
      .select('id')
      .maybeSingle();

    if (!locked) {
      return reply.send({ success: true, alreadyApproved: true });
    }

    // ── Scale post credits (A5) ───────────────────────────────────────────────
    // Scale plan: 5 posts/month free. Additional posts charged $1 each.
    // Credit tracking is best-effort — do not block publish on DB errors.
    try {
      const { data: billingRow } = await db
        .from('billing_customers')
        .select('plan, scale_post_credits_used, credits_period, downgrade_requested_at')
        .eq('tenant_id', request.tenantId)
        .maybeSingle();

      if (billingRow && (billingRow as any).plan === 'pro' && !(billingRow as any).downgrade_requested_at) {
        const nowPeriod = (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        const storedPeriod = (billingRow as any).credits_period ?? '';
        const postUsed = storedPeriod === nowPeriod ? ((billingRow as any).scale_post_credits_used ?? 0) : 0;
        const POST_LIMIT = 5;

        if (postUsed < POST_LIMIT) {
          // Consume a free credit
          await db.from('billing_customers').update({
            scale_post_credits_used: postUsed + 1,
            credits_period: nowPeriod,
            updated_at: new Date().toISOString(),
          }).eq('tenant_id', request.tenantId);
        }
        // If post_used >= POST_LIMIT, the $1 charge will appear on the monthly invoice
        // (tracked as cost_usd on the social_post record)
      }
    } catch {
      // Non-fatal — continue with publish
    }

    // Publish immediately (gate + snapshot already done above)
    let publishResult: { success: boolean; externalId?: string; error?: string } | null = null;
    if (publish_now) {
      try {
        const { publishSocialPost } = await import('../services/social-publisher.js');
        const merged = {
          ...post,
          ...update,
          content: update.client_edit ?? post.client_edit ?? post.content,
          __approval_snapshot_id: snapshot?.id ?? null,
          __approval_snapshot_hash: snapshot?.content_hash ?? null,
        };
        publishResult = await publishSocialPost(merged);
        const now = new Date().toISOString();
        if (publishResult.success) {
          await db.from('social_posts').update({
            status: 'published',
            external_post_id: publishResult.externalId ?? null,
            published_at: now,
            billed: true,
            updated_at: now,
          }).eq('id', id).eq('tenant_id', request.tenantId);
        } else {
          await db.from('social_posts').update({ status: 'failed', updated_at: now }).eq('id', id).eq('tenant_id', request.tenantId);
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

    await db.from('social_posts').update(update).eq('id', id).eq('tenant_id', request.tenantId);
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

    await db.from('social_posts').delete().eq('id', id).eq('tenant_id', request.tenantId);
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

  // ── Cancel cooling-off ────────────────────────────────────────────────────
  app.post('/social/posts/:id/cancel-cooling-off', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { data: post } = await db.from('social_posts')
      .select('id, status')
      .eq('id', id).eq('tenant_id', request.tenantId).single();
    if (!post) return reply.code(404).send({ error: 'Not found' });
    if (post.status !== 'cooling_off') {
      return reply.code(400).send({ error: 'Post is not in cooling-off window' });
    }
    await db.from('social_posts')
      .update({
        status: 'pending_approval',
        cooling_off_cancelled: true,
        cooling_off_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', request.tenantId);
    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'social.cooling_off_cancelled',
      actor: 'user',
      payload: { postId: id },
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

  // ── Generate AI image for a specific post ────────────────────────────────
  app.post('/social/posts/:id/generate-image', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { prompt } = (request.body ?? {}) as { prompt?: string };

    const { data: post } = await db.from('social_posts')
      .select('content, platform, tenant_id')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    if (!post) return reply.code(404).send({ error: 'Post not found' });

    const { data: settings } = await db.from('client_settings')
      .select('website_url, logo_url, strategy_plan')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return reply.code(503).send({ error: 'Image generation not configured — OPENAI_API_KEY missing' });

    const imgPrompt = prompt ?? `Professional social media image for a ${post.platform} post.
Business context: ${settings?.website_url ?? 'local business'}.
Post text: ${post.content?.slice(0, 200)}.
Style: vibrant, modern, engaging. No text overlay. Square format.`;

    try {
      const genRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: imgPrompt, n: 1, size: '1024x1024', quality: 'medium' }),
      });

      if (!genRes.ok) {
        const body = await genRes.text().catch(() => '');
        let msg = 'Image generation failed';
        try { msg = (JSON.parse(body) as any)?.error?.message ?? msg; } catch { /* not JSON */ }
        return reply.code(500).send({ error: msg });
      }

      const genData = await genRes.json() as { data: Array<{ b64_json?: string }> };
      const b64 = genData.data?.[0]?.b64_json;
      if (!b64) return reply.code(500).send({ error: 'Image generation returned no data' });

      // Upload to Supabase Storage
      const buffer = Buffer.from(b64, 'base64');
      const storagePath = `${request.tenantId}/post_${id}_${Date.now()}.png`;
      const { error: uploadErr } = await db.storage.from('brand_assets').upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });
      if (uploadErr) return reply.code(500).send({ error: 'Failed to save image' });
      const { data: urlData } = db.storage.from('brand_assets').getPublicUrl(storagePath);
      const imageUrl = urlData.publicUrl;

      await db.from('social_posts')
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq('id', id).eq('tenant_id', request.tenantId);

      await db.from('audit_log').insert({
        tenant_id: request.tenantId, action: 'social.post_image_generated',
        platform: post.platform, actor: 'ai', payload: { postId: id },
      });

      return reply.send({ image_url: imageUrl });
    } catch (err) {
      request.log.error({ err }, 'DALL-E image generation failed');
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Generation failed' });
    }
  });

  // ── Manual generate ───────────────────────────────────────────────────────
  app.post('/social/generate', { preHandler: authenticate }, async (request, reply) => {
    const frozen = await isFrozenFor(request.tenantId, 'generation');
    if (frozen.frozen) {
      return reply.code(423).send({ error: 'tenant_frozen', capability: 'generation', reason: frozen.reason });
    }
    const tier = await getTrustTier(request.tenantId).catch(() => 'standard' as const);
    const tierGate = actionGateForTier(tier, 'generation');
    if (!tierGate.allow) {
      return reply.code(403).send({ error: 'trust_tier_blocked', tier, reason: tierGate.reason });
    }
    try {
      const body = (request.body ?? {}) as { brief?: Record<string, string>; force?: boolean };
      const result = await generateWeeklyPostsForTenant(request.tenantId, body.brief ?? null, body.force === true);
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
    if (!assertCronSecret(request, reply)) return;

    const { data: activeTenants } = await db
      .from('social_settings')
      .select('tenant_id')
      .eq('enabled', true);

    if (!activeTenants?.length) return reply.send({ processed: 0 });

    let processed = 0;
    let skippedFrozen = 0;
    for (const row of activeTenants) {
      const frozen = await isFrozenFor(row.tenant_id, 'generation');
      if (frozen.frozen) { skippedFrozen++; continue; }
      try {
        await generateWeeklyPostsForTenant(row.tenant_id);
        processed++;
      } catch (err) {
        console.error(`Social generation failed for tenant ${row.tenant_id}:`, err);
      }
    }

    return reply.send({ processed, skipped_frozen: skippedFrozen });
  });

  // ── Cron: publish scheduled posts ─────────────────────────────────────────
  app.post('/social/cron/publish', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;

    const now = new Date().toISOString();

    // Posts approved and scheduled for now or earlier, OR cooling-off posts past their window
    const { data: approvedDue } = await db
      .from('social_posts')
      .select('*')
      .eq('status', 'approved')
      .lte('scheduled_for', now);

    const { data: coolingOffDue } = await db
      .from('social_posts')
      .select('*')
      .eq('status', 'cooling_off')
      .eq('cooling_off_cancelled', false)
      .lte('cooling_off_until', now);

    const due = [...(approvedDue ?? []), ...(coolingOffDue ?? [])];

    if (!due?.length) return reply.send({ published: 0 });

    let published = 0;
    let blocked = 0;
    let skippedFrozen = 0;
    for (const post of due) {
      try {
        // Admin freeze gate at cron level — skip frozen tenants.
        const frozen = await isFrozenFor(post.tenant_id, 'publish');
        if (frozen.frozen) { skippedFrozen++; continue; }
        // Last line of defense: re-gate the FINAL bytes the cron is about to push.
        // The PATCH endpoint lets approved-but-not-published posts be edited
        // (issue #post-patch-bypass), so the content here may differ from what
        // was approved. Cheap fast-path covers most cases.
        const finalText: string = post.client_edit?.trim() || post.content;
        const cronGate = await classifyAndLog({
          tenantId: post.tenant_id,
          text: finalText,
          kind: 'post',
          source: 'post_flight',
        });
        if (cronGate.decision === 'block' || cronGate.decision === 'require_human_review') {
          await db.from('social_posts').update({
            status: 'blocked_by_policy',
            updated_at: new Date().toISOString(),
          }).eq('id', post.id);
          blocked++;
          continue;
        }

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

    return reply.send({ published, blocked, skipped_frozen: skippedFrozen });
  });

  // ── Cron: fetch engagement analytics for published posts ──────────────────
  app.post('/social/cron/analytics', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;

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
    const { status, sentiment, platform, limit = 50 } = request.query as any;
    let q = db
      .from('social_comments')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .order('commented_at', { ascending: false })
      .limit(Number(limit));

    if (status) q = q.eq('status', status);
    if (sentiment) q = q.eq('sentiment', sentiment);
    if (platform) q = q.eq('platform', platform);

    const { data } = await q;
    return reply.send({ comments: data ?? [] });
  });

  // ── Send reply ────────────────────────────────────────────────────────────
  app.post('/social/comments/:id/send', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { reply_text } = request.body as any;

    if (!reply_text?.trim()) return reply.code(400).send({ error: 'reply_text required' });

    const result = await sendCommentReply(request.tenantId, id, reply_text.trim(), {
      editedByClerkUserId: request.clerkUserId,
    });
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
    if (!assertCronSecret(request, reply)) return;

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

async function generateWeeklyPostsForTenant(
  tenantId: string,
  brief?: Record<string, string> | null,
  force = false,
): Promise<{ generated: number; skipped: number; errors: number; lastError: string | null }> {
  const { data: settings } = await db
    .from('social_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .maybeSingle();

  if (!settings) return { generated: 0, skipped: 0, errors: 0, lastError: null };

  const { data: clientSettings } = await db
    .from('client_settings')
    .select('website_url, website_analysis, goal, strategy_plan, logo_url, content_language')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Determine the language posts should be written in.
  // Territory takes precedence over website language detection.
  const geoInclude: string[] = (clientSettings?.strategy_plan as any)?.geo_include ?? [];
  const resolvedLang = resolvePostLanguage(geoInclude, (clientSettings as any)?.content_language);

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
  if (!platforms.length) return { generated: 0, skipped: 0, errors: 0, lastError: null };

  const pillars: string[] = settings.content_pillars ?? ['educational', 'promotional', 'social_proof'];
  const pillarIndex = settings.active_pillar_index ?? 0;
  const thisPillar = pillars[pillarIndex % pillars.length];

  // Next Monday at optimal time per platform
  const nextMonday = getNextMonday();

  // Posts Intelligence — fetch once and share across all platform generations
  const postsIntelligence = await buildPostsIntelligence(tenantId);
  const campaignIntelligence = postsIntelligence?.contextBlock ?? null;
  if (postsIntelligence && postsIntelligence.activeCampaignCount > 0) {
    console.log(`[posts-intelligence] phase=${postsIntelligence.strategicPhase} campaigns=${postsIntelligence.activeCampaignCount} tenant=${tenantId}`);
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;
  let lastError: string | null = null;

  for (const platformConfig of platforms) {
    const { platform } = platformConfig;

    // Don't generate if already have a post scheduled this week for this platform
    const weekStart = new Date(nextMonday); // window starts ON Monday, not Sunday before
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

    if (existing?.length && !force) { skipped++; continue; }

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
        logoUrl: (clientSettings as any)?.logo_url ?? undefined,
        contentLanguage: resolvedLang ?? ((clientSettings as any)?.content_language ?? undefined),
        brief: brief ?? undefined,
        campaignIntelligence,
      });

      // Generate a translation for the business owner if the post is in a non-Hebrew language.
      // This allows Israeli business owners to review and approve foreign-language posts.
      const postLang = resolvedLang ?? null;
      let contentTranslation: string | null = null;
      if (postLang && postLang !== 'he' && content.text.length > 0) {
        contentTranslation = await generateTranslation(content.text, postLang, 'he');
      } else if (postLang === 'he' || !postLang) {
        // Hebrew post targeted at Hebrew speakers — no translation needed
        contentTranslation = null;
      }

      const scheduledFor = getOptimalPostTime(platform, nextMonday);
      const costUsd = platform === 'tiktok' ? 3.00 : 1.00;

      const { data: post, error: insertErr } = await db.from('social_posts').insert({
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
        content_language: postLang,
        content_translation: contentTranslation,
      }).select('id').single();

      if (insertErr) {
        // Unique constraint violation = race condition (another concurrent request already inserted)
        if (insertErr.code === '23505') { skipped++; continue; }
        errors++;
        lastError = insertErr.message;
        continue;
      }

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
      errors++;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // Advance pillar index only when posts were actually generated
  if (generated > 0) {
    await db.from('social_settings').update({
      active_pillar_index: (pillarIndex + 1) % pillars.length,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId);
  }

  return { generated, skipped, errors, lastError };
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

const META_VERSION = 'v21.0';
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

// Chat routes
//
// POST /chat          — send a message, get AI response (executes actions)
// GET  /chat/history  — last N messages

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';
import {
  pauseGoogleCampaign, pauseMetaCampaign, pauseTikTokCampaign,
  resumeGoogleCampaign, resumeMetaCampaign, resumeTikTokCampaign,
} from '@vigmis/ad-connectors';
import { generateSocialContent } from '../services/social-content.js';
import { classifyIntent } from '../services/intent-router.js';
import { checkChatQuota, recordAiCost } from '../services/usage.js';
import { neutralizeActionTags, parseActions } from './chat-actions.js';

type ExecutedAction = {
  type: string;
  campaign_id?: string;
  campaign_name?: string;
  post_id?: string;
  detail?: string;
  success: boolean;
};

function isPlatform(p: string): p is 'facebook' | 'instagram' | 'tiktok' {
  return p === 'facebook' || p === 'instagram' || p === 'tiktok';
}

async function executeActions(
  actions: Array<{ type: string; args: string[] }>,
  tenantId: string,
): Promise<ExecutedAction[]> {
  const results: ExecutedAction[] = [];

  for (const { type, args } of actions) {

    if (type === 'pause_campaign') {
      const [id] = args;
      const { data: c } = await db.from('campaigns').select('*').eq('id', id).eq('tenant_id', tenantId).single();
      if (!c) { results.push({ type, campaign_id: id, success: false, detail: 'Campaign not found' }); continue; }
      try {
        if (c.external_id) {
          if (c.platform === 'google') await pauseGoogleCampaign(c.external_id, tenantId);
          else if (c.platform === 'tiktok') await pauseTikTokCampaign(c.external_id, tenantId);
          else await pauseMetaCampaign(c.external_id, tenantId);
        }
        await db.from('campaigns').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', id);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'campaign.paused_via_chat', platform: c.platform, actor: 'ai', payload: { campaignId: id } });
        results.push({ type, campaign_id: id, campaign_name: c.name, success: true });
      } catch (err) {
        results.push({ type, campaign_id: id, campaign_name: c.name, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'resume_campaign') {
      const [id] = args;
      const { data: c } = await db.from('campaigns').select('*').eq('id', id).eq('tenant_id', tenantId).single();
      if (!c) { results.push({ type, campaign_id: id, success: false, detail: 'Not found' }); continue; }
      try {
        if (c.external_id) {
          if (c.platform === 'google') await resumeGoogleCampaign(c.external_id, tenantId);
          else if (c.platform === 'tiktok') await resumeTikTokCampaign(c.external_id, tenantId);
          else await resumeMetaCampaign(c.external_id, tenantId);
        }
        await db.from('campaigns').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', id);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'campaign.resumed_via_chat', platform: c.platform, actor: 'ai', payload: { campaignId: id } });
        results.push({ type, campaign_id: id, campaign_name: c.name, success: true });
      } catch (err) {
        results.push({ type, campaign_id: id, campaign_name: c.name, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'update_budget') {
      const [id, amountStr] = args;
      const newBudget = parseFloat(amountStr);
      if (isNaN(newBudget) || newBudget < 1) { results.push({ type, campaign_id: id, success: false, detail: 'Invalid amount' }); continue; }
      const { data: c } = await db.from('campaigns').select('name, platform, daily_budget_usd').eq('id', id).eq('tenant_id', tenantId).single();
      if (!c) { results.push({ type, campaign_id: id, success: false, detail: 'Not found' }); continue; }
      try {
        await db.from('campaigns').update({ daily_budget_usd: newBudget, updated_at: new Date().toISOString() }).eq('id', id);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'campaign.budget_updated_via_chat', platform: c.platform, actor: 'ai', payload: { campaignId: id, oldBudget: c.daily_budget_usd, newBudget } });
        results.push({ type, campaign_id: id, campaign_name: c.name, success: true, detail: `$${c.daily_budget_usd}/day → $${newBudget}/day` });
      } catch {
        results.push({ type, campaign_id: id, campaign_name: c.name, success: false });
      }
    }

    else if (type === 'pause_all') {
      const { data: active } = await db.from('campaigns').select('*').eq('tenant_id', tenantId).eq('status', 'active');
      let paused = 0;
      for (const c of active ?? []) {
        try {
          if (c.external_id) {
            if (c.platform === 'google') await pauseGoogleCampaign(c.external_id, tenantId);
            else if (c.platform === 'tiktok') await pauseTikTokCampaign(c.external_id, tenantId);
            else await pauseMetaCampaign(c.external_id, tenantId);
          }
          await db.from('campaigns').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', c.id);
          paused++;
        } catch { /* continue */ }
      }
      await db.from('audit_log').insert({ tenant_id: tenantId, action: 'campaigns.paused_all_via_chat', actor: 'ai', payload: { paused } });
      results.push({ type, success: true, detail: `${paused} campaign${paused !== 1 ? 's' : ''} paused` });
    }

    else if (type === 'create_post') {
      // AI-generate a post: create_post|platform|pillar
      const [platform, pillar = 'promotional'] = args;
      if (!isPlatform(platform)) { results.push({ type, success: false, detail: `Invalid platform "${platform}"` }); continue; }
      try {
        const [{ data: cs }, { data: ss }] = await Promise.all([
          db.from('client_settings').select('website_url, website_analysis, goal, strategy_plan, content_language').eq('tenant_id', tenantId).maybeSingle(),
          db.from('social_settings').select('brand_voice, approval_mode').eq('tenant_id', tenantId).maybeSingle(),
        ]);
        const content = await generateSocialContent({
          tenantId,
          platform,
          pillar,
          websiteUrl: cs?.website_url ?? undefined,
          websiteAnalysis: cs?.website_analysis ?? undefined,
          goal: cs?.goal ?? 'leads',
          strategyPlan: cs?.strategy_plan ?? undefined,
          brandVoice: ss?.brand_voice ?? undefined,
          contentLanguage: (cs as any)?.content_language ?? undefined,
        });
        const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { data: post } = await db.from('social_posts').insert({
          tenant_id: tenantId,
          platform,
          pillar,
          status: ss?.approval_mode === 'auto' ? 'approved' : 'pending_approval',
          content: content.text,
          hashtags: content.hashtags,
          image_url: content.imageUrl ?? null,
          video_url: content.videoUrl ?? null,
          scheduled_for: scheduledFor,
          cost_usd: platform === 'tiktok' ? 3.00 : 1.00,
        }).select('id').single();
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'social.post_created_via_chat', platform, actor: 'ai', payload: { postId: post?.id, pillar } });
        results.push({ type, post_id: post?.id, success: true, detail: `Drafted ${platform} post (${pillar})` });
      } catch (err) {
        results.push({ type, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'write_post') {
      // Manual post with custom text: write_post|platform|pillar|content_text
      const [platform, pillar = 'promotional', ...rest] = args;
      const contentText = rest.join('|').trim();
      if (!isPlatform(platform)) { results.push({ type, success: false, detail: `Invalid platform "${platform}"` }); continue; }
      if (!contentText) { results.push({ type, success: false, detail: 'Post text is empty' }); continue; }
      try {
        const { data: ss } = await db.from('social_settings').select('approval_mode').eq('tenant_id', tenantId).maybeSingle();
        const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { data: post } = await db.from('social_posts').insert({
          tenant_id: tenantId,
          platform,
          pillar,
          status: ss?.approval_mode === 'auto' ? 'approved' : 'pending_approval',
          content: contentText,
          hashtags: [],
          scheduled_for: scheduledFor,
          cost_usd: platform === 'tiktok' ? 3.00 : 1.00,
        }).select('id').single();
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'social.post_written_via_chat', platform, actor: 'user', payload: { postId: post?.id, pillar } });
        results.push({ type, post_id: post?.id, success: true, detail: `Custom ${platform} post saved` });
      } catch (err) {
        results.push({ type, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'edit_post') {
      // edit_post|postId|new content
      const [postId, ...rest] = args;
      const newText = rest.join('|').trim();
      if (!postId || !newText) { results.push({ type, post_id: postId, success: false, detail: 'postId and new content required' }); continue; }
      const { data: p } = await db.from('social_posts').select('id, platform, status').eq('id', postId).eq('tenant_id', tenantId).single();
      if (!p) { results.push({ type, post_id: postId, success: false, detail: 'Post not found' }); continue; }
      if (p.status === 'published') { results.push({ type, post_id: postId, success: false, detail: 'Already published — cannot edit' }); continue; }
      try {
        await db.from('social_posts').update({ content: newText, client_edit: newText, updated_at: new Date().toISOString() }).eq('id', postId);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'social.post_edited_via_chat', platform: p.platform, actor: 'user', payload: { postId } });
        results.push({ type, post_id: postId, success: true, detail: 'Post text updated' });
      } catch (err) {
        results.push({ type, post_id: postId, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'set_post_image') {
      // set_post_image|postId|imageUrl
      const [postId, imageUrl] = args;
      if (!postId || !imageUrl) { results.push({ type, post_id: postId, success: false, detail: 'postId and imageUrl required' }); continue; }
      if (!/^https?:\/\//i.test(imageUrl)) { results.push({ type, post_id: postId, success: false, detail: 'imageUrl must start with http(s)://' }); continue; }
      const { data: p } = await db.from('social_posts').select('id, platform, status').eq('id', postId).eq('tenant_id', tenantId).single();
      if (!p) { results.push({ type, post_id: postId, success: false, detail: 'Post not found' }); continue; }
      if (p.status === 'published') { results.push({ type, post_id: postId, success: false, detail: 'Already published' }); continue; }
      try {
        await db.from('social_posts').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', postId);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'social.post_image_set_via_chat', platform: p.platform, actor: 'user', payload: { postId, imageUrl } });
        results.push({ type, post_id: postId, success: true, detail: 'Image attached' });
      } catch (err) {
        results.push({ type, post_id: postId, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'approve_post' || type === 'reject_post') {
      const [postId, ...rest] = args;
      if (!postId) { results.push({ type, success: false, detail: 'postId required' }); continue; }
      const { data: p } = await db.from('social_posts').select('id, platform, status').eq('id', postId).eq('tenant_id', tenantId).single();
      if (!p) { results.push({ type, post_id: postId, success: false, detail: 'Post not found' }); continue; }
      const update: any = { updated_at: new Date().toISOString() };
      if (type === 'approve_post') update.status = 'approved';
      else { update.status = 'rejected'; update.rejected_reason = rest.join('|').trim() || null; }
      try {
        await db.from('social_posts').update(update).eq('id', postId);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: `social.post_${type === 'approve_post' ? 'approved' : 'rejected'}_via_chat`, platform: p.platform, actor: 'user', payload: { postId } });
        results.push({ type, post_id: postId, success: true });
      } catch (err) {
        results.push({ type, post_id: postId, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'select_ad_account') {
      // select_ad_account|act_123456789
      const [accountId] = args;
      if (!accountId || !/^act_\d+$/.test(accountId)) {
        results.push({ type, success: false, detail: 'account_id must look like "act_123456789"' }); continue;
      }
      const { error } = await db
        .from('platform_tokens')
        .update({ account_id: accountId, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('platform', 'meta');
      if (error) { results.push({ type, success: false, detail: error.message }); continue; }
      await db.from('audit_log').insert({
        tenant_id: tenantId,
        action: 'connector.meta.ad_account_selected_via_chat',
        platform: 'meta',
        actor: 'user',
        payload: { account_id: accountId },
      });
      results.push({ type, success: true, detail: accountId });
    }

    else if (type === 'schedule_post') {
      // schedule_post|postId|ISO datetime
      const [postId, when] = args;
      const dt = when ? new Date(when) : null;
      if (!postId || !dt || isNaN(dt.getTime())) { results.push({ type, post_id: postId, success: false, detail: 'postId and ISO datetime required' }); continue; }
      const { data: p } = await db.from('social_posts').select('id, platform, status').eq('id', postId).eq('tenant_id', tenantId).single();
      if (!p) { results.push({ type, post_id: postId, success: false, detail: 'Post not found' }); continue; }
      try {
        await db.from('social_posts').update({ scheduled_for: dt.toISOString(), updated_at: new Date().toISOString() }).eq('id', postId);
        await db.from('audit_log').insert({ tenant_id: tenantId, action: 'social.post_rescheduled_via_chat', platform: p.platform, actor: 'user', payload: { postId, scheduled_for: dt.toISOString() } });
        results.push({ type, post_id: postId, success: true, detail: `Scheduled for ${dt.toISOString()}` });
      } catch (err) {
        results.push({ type, post_id: postId, success: false, detail: err instanceof Error ? err.message : 'Failed' });
      }
    }

    else if (type === 'resume_all') {
      const { data: pausedList } = await db.from('campaigns').select('*').eq('tenant_id', tenantId).eq('status', 'paused');
      let resumed = 0;
      for (const c of pausedList ?? []) {
        try {
          if (c.external_id) {
            if (c.platform === 'google') await resumeGoogleCampaign(c.external_id, tenantId);
            else if (c.platform === 'tiktok') await resumeTikTokCampaign(c.external_id, tenantId);
            else await resumeMetaCampaign(c.external_id, tenantId);
          }
          await db.from('campaigns').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', c.id);
          resumed++;
        } catch { /* continue */ }
      }
      await db.from('audit_log').insert({ tenant_id: tenantId, action: 'campaigns.resumed_all_via_chat', actor: 'ai', payload: { resumed } });
      results.push({ type, success: true, detail: `${resumed} campaign${resumed !== 1 ? 's' : ''} resumed` });
    }
  }

  return results;
}

const SYSTEM_PROMPT = `CRITICAL: You have full context about this business below. NEVER ask the user what their business does, what they sell, who their customers are, or any basic business question — you already know. If you need to refer to their business, use the data provided. If strategy or website analysis is not yet available, guide the user to complete onboarding — but still do NOT ask "what do you sell."

You are VIGMIS — the client's Senior Campaign Manager, Performance Strategist, and Media Buyer. You have full visibility into their account: campaigns, real spend, real ROAS, pending decisions, recent AI actions, and external context (weather, news, calendar). You act like the head of their ad agency who reads the data before every meeting.

## How you think and respond

**You are opinionated. Give your view first, then explain why.**
- DO: "I'd pause that campaign — ROAS dropped 40% this week and spend is still running. Want me to do it?"
- DON'T: "There are several approaches to consider..."

**You connect dots. If multiple signals point the same direction, say so.**
- Example: "Your ROAS dropped + there's industry news about a competitor launching + it's high season — the problem isn't the ads, it's probably the landing page. Here's why..."

**You use the data you already have. Never ask for information that's in the context below.**
- The account data, KPIs, campaign statuses, and alerts are all injected below. Use them.

**If you're missing ONE critical piece of info: ask exactly one question.**
- "Which campaign are you referring to — Meta Retargeting or Google Search?"
- NOT a list of clarifying questions.

**When you CAN execute: offer to. When you DO execute: explain what you did and why.**

## What you can execute
Embed action tags anywhere in your response. They run immediately.

Campaign actions:
- Pause a campaign:    [ACTION:pause_campaign:CAMPAIGN_ID]
- Resume a campaign:   [ACTION:resume_campaign:CAMPAIGN_ID]
- Change daily budget: [ACTION:update_budget:CAMPAIGN_ID:AMOUNT_IN_USD]
- Pause ALL campaigns: [ACTION:pause_all]
- Resume ALL campaigns: [ACTION:resume_all]

Social actions:
- Generate AI post:    [ACTION:create_post|PLATFORM|PILLAR]    (PLATFORM: facebook|instagram|tiktok ; PILLAR: educational|promotional|social_proof|behind_the_scenes|trending)
- Write a manual post: [ACTION:write_post|PLATFORM|PILLAR|FULL POST TEXT]
- Edit a post's text:  [ACTION:edit_post|POST_ID|NEW FULL TEXT]
- Attach an image URL: [ACTION:set_post_image|POST_ID|https://...]
- Approve a post:      [ACTION:approve_post|POST_ID]
- Reject a post:       [ACTION:reject_post|POST_ID|optional reason]
- Reschedule a post:   [ACTION:schedule_post|POST_ID|ISO_DATETIME]
- Set Meta Ad Account: [ACTION:select_ad_account|act_NUMERIC_ID]

## Hard rules
1. Only execute actions when the client explicitly asks. Never change things proactively.
2. Always state the OLD value and NEW value before a budget change.
3. Never invent numbers, IDs, or URLs — only use values from the context below.
4. For edits/approvals/rejects: use the exact POST_ID from the Social Posts list.
5. If asked for an image upload: ask them to paste a public URL (action only accepts URLs).
6. Reply in the same language the client uses in their CURRENT message — not historical messages. If they write in English now, reply in English, even if past messages were in Hebrew.
7. Write creative — ad copy, headlines, post captions, CTAs — immediately. Never say "I can't help with creative." Use the brand context below.
8. If the Meta Ad Account is blank: tell them to open Dashboard → Social → Connect → Meta Ad Account.

## Platform rules (hard knowledge — do not rely on general training data)
**Meta:** Prohibited: health claims, before/after weight loss images, financial guarantees, shocking content, adult content unless age-gated. Frequency > 3 in prospecting = creative fatigue. CTR benchmark: 0.9-1.5% feed, 1.5-3% stories. Learning phase = 50 conversions per ad set.
**Google:** Quality Score drives CPC. Broad match keywords need conversion data before using. ROAS bidding needs ≥30 conversions/month. Search partners often lower quality — exclude if CPA is high.
**TikTok:** Hook must land in first 2 seconds. Completion rate > 25% = good. Native-looking videos outperform polished ads. Audience skews 18-34. Not suited for B2B, medical, or 50+ audiences.

## Budget × Geography intelligence (proactively apply)
When a client asks about multi-territory targeting or budget allocation across countries:
- Under $1,500/mo managed: recommend ONE primary market. Spreading thin = no frequency = no learning.
- $1,500–4,000/mo: max 2 markets. Start with the highest-intent geography (typically home country or highest-LTV market).
- $4,000–10,000/mo: 3–4 markets viable if CPCs are similar. Separate campaigns per country — never combine.
- Over $10,000/mo: can scale internationally but still recommend prioritizing by ROAS history.
- Seasonality rule: if the client is in Q4 or a local holiday period, recommend doubling down on primary market before expanding.
- If a client asks "how do I split between country A and country B" with a small budget: give a concrete % recommendation, not "it depends". Default: 70% primary / 30% secondary.`;



export async function chatRoutes(app: FastifyInstance) {

  app.post<{ Body: { message: string; pageContext?: string } }>(
    '/chat',
    { preHandler: authenticate },
    async (request, reply) => {
      const { message, pageContext } = request.body ?? {};
      if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

      const tenantId = request.tenantId;

      // Quota / circuit-breaker gate — runs BEFORE any LLM work so a frozen or
      // out-of-allowance tenant can't keep burning tokens. Soft wall, not error.
      const quota = await checkChatQuota(tenantId);
      if (!quota.allowed) {
        await db.from('chat_messages').insert([
          { tenant_id: tenantId, role: 'user', content: message.trim() },
          { tenant_id: tenantId, role: 'assistant', content: quota.reason },
        ]);
        return reply.send({ message: quota.reason, executedActions: [] });
      }

      // Intent router — every chat message goes through here BEFORE the heavy
      // chat engine runs. Short-circuits ethical/legal/platform blocks with a
      // structured reply + alternative. native_capability falls through.
      const intent = await classifyIntent({
        tenantId,
        message: message.trim(),
        pageContext,
      });
      if (intent.bucket !== 'native_capability' && intent.user_facing_response) {
        await db.from('chat_messages').insert([
          { tenant_id: tenantId, role: 'user', content: message.trim() },
          { tenant_id: tenantId, role: 'assistant', content: intent.user_facing_response },
        ]);
        return reply.send({ message: intent.user_facing_response, executedActions: [] });
      }

      const [historyRes, campaignsRes, settingsRes, postsRes, socialSettingsRes, metaTokenRes, assetsRes, ga4Res, protocolsRes, auditRes, newsRes] = await Promise.all([
        db.from('chat_messages').select('role, content').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20),
        db.from('campaigns').select('id, name, platform, status, daily_budget_usd, campaign_type').eq('tenant_id', tenantId).limit(30),
        db.from('client_settings').select('goal, budget_monthly_ils, management_percentage, website_url, risk_level, exclusions, open_notes, business_type, margin_pct, geo_include, geo_exclude, preferred_platforms, strategy_plan, content_language, budget_currency, website_analysis, business_name').eq('tenant_id', tenantId).maybeSingle(),
        db.from('social_posts').select('id, platform, pillar, status, content, scheduled_for').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(20),
        db.from('social_settings').select('enabled, platforms, approval_mode, content_pillars, facebook_page_id, instagram_user_id').eq('tenant_id', tenantId).maybeSingle(),
        db.from('platform_tokens').select('account_id').eq('tenant_id', tenantId).eq('platform', 'meta').maybeSingle(),
        db.from('brand_assets').select('filename, public_url, kind').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20),
        // Phase 2: real-time account intelligence
        db.from('ga4_daily_metrics').select('date, sessions, conversions, revenue_usd, source, medium').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(14),
        db.from('decision_protocols').select('id, type, title, status, created_at').eq('tenant_id', tenantId).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
        db.from('audit_log').select('action, actor, payload, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
        db.from('news_alerts').select('title, why_relevant, suggested_action, relevance_score').eq('tenant_id', tenantId).neq('status', 'dismissed').order('relevance_score', { ascending: false }).limit(3),
      ]);

      const pastMessages = (historyRes.data ?? []).reverse();
      const campaigns = campaignsRes.data ?? [];
      const settings = settingsRes.data;
      const posts = postsRes.data ?? [];
      const socialSettings = socialSettingsRes.data;
      const selectedAdAccount = metaTokenRes.data?.account_id ?? null;
      const brandAssets = assetsRes.data ?? [];
      const ga4Metrics = ga4Res.data ?? [];
      const pendingProtocols = protocolsRes.data ?? [];
      const recentActions = auditRes.data ?? [];
      const activeNews = newsRes.data ?? [];

      const active = campaigns.filter(c => c.status === 'active');
      const paused = campaigns.filter(c => c.status === 'paused');

      const campaignLines = campaigns.length
        ? campaigns.map(c => `  [${c.id}] ${c.name} | ${c.platform} | ${c.status} | $${c.daily_budget_usd}/day`).join('\n')
        : '  (none yet)';

      const postLines = posts.length
        ? posts.map(p => `  [${p.id}] ${p.platform} | ${p.pillar} | ${p.status} | scheduled ${p.scheduled_for ?? '—'} | "${(p.content ?? '').slice(0, 80).replace(/\s+/g, ' ')}${(p.content ?? '').length > 80 ? '…' : ''}"`).join('\n')
        : '  (none yet)';

      const socialLine = socialSettings?.enabled
        ? `Enabled: yes | Approval mode: ${socialSettings.approval_mode} | Platforms: ${(socialSettings.platforms as any[] ?? []).map((p: any) => p.platform).join(', ') || '(none)'} | Pillars: ${(socialSettings.content_pillars ?? []).join(', ')}`
        : 'Social media management is disabled for this tenant.';

      const assetLines = brandAssets.length
        ? brandAssets.map(a => `  [${a.kind ?? 'asset'}] ${a.filename} — ${a.public_url}`).join('\n')
        : '  (none uploaded yet)';

      // GA4: last 7 days summary
      const ga4Last7 = ga4Metrics.slice(0, 7);
      const ga4TotalSessions = ga4Last7.reduce((s, r) => s + (r.sessions ?? 0), 0);
      const ga4TotalConversions = ga4Last7.reduce((s, r) => s + (r.conversions ?? 0), 0);
      const ga4TotalRevenue = ga4Last7.reduce((s, r) => s + (r.revenue_usd ?? 0), 0);
      const ga4Line = ga4Last7.length > 0
        ? `Last 7 days (GA4 ground truth): ${ga4TotalSessions} sessions | ${ga4TotalConversions} conversions | $${ga4TotalRevenue.toFixed(0)} revenue | Conv. rate: ${ga4TotalSessions > 0 ? ((ga4TotalConversions / ga4TotalSessions) * 100).toFixed(2) : '0'}%`
        : '(no GA4 data yet)';

      const protocolLines = pendingProtocols.length > 0
        ? pendingProtocols.map(p => `  [${p.id}] ${p.type}: "${p.title}" — awaiting approval`).join('\n')
        : '  (none pending)';

      const auditLines = recentActions.length > 0
        ? recentActions.slice(0, 5).map(a => `  ${a.actor === 'system' ? 'AI' : 'User'}: ${a.action}${a.payload ? ` (${JSON.stringify(a.payload).slice(0, 80)})` : ''}`).join('\n')
        : '  (no recent actions)';

      const newsLines = activeNews.length > 0
        ? activeNews.map(n => `  • ${n.title} [score: ${n.relevance_score}] — ${n.why_relevant}`).join('\n')
        : '  (none)';

      const geoInclude = (settings as any)?.geo_include as string[] | undefined;
      const geoExclude = (settings as any)?.geo_exclude as string[] | undefined;
      const preferredPlatforms = (settings as any)?.preferred_platforms as string[] | undefined;
      const strategyPlan = (settings as any)?.strategy_plan as Record<string, unknown> | null | undefined;
      const budgetCurrency = (settings as any)?.budget_currency as string | undefined;
      const websiteAnalysis = (settings as any)?.website_analysis as string | null | undefined;
      const businessName = (settings as any)?.business_name as string | null | undefined;

      const strategyNarrative = strategyPlan?.strategy_narrative as string | undefined;
      const strategyPlatforms = strategyPlan?.platforms as Array<{ name: string; budget_percentage: number; reasoning: string }> | undefined;
      const targetAudience = strategyPlan?.target_audience as string | undefined;

      const clientContext = [
        '## Client',
        settings
          ? `${businessName ? `Business name: ${businessName} | ` : ''}Goal: ${settings.goal} | Business type: ${(settings as any).business_type ?? '—'} | Budget: ${budgetCurrency ?? 'ILS'} ${settings.budget_monthly_ils} (~$${Math.round(settings.budget_monthly_ils / 3.7)}/mo) | Vigmis manages: ${settings.management_percentage}% | Website: ${settings.website_url} | Risk: ${settings.risk_level}${(settings as any).margin_pct ? ` | Margin: ${(settings as any).margin_pct}%` : ''}${(settings as any).exclusions ? ` | Exclusions: ${(settings as any).exclusions}` : ''}${(settings as any).open_notes ? ` | Notes: ${(settings as any).open_notes}` : ''}`
          : 'No settings yet',
        geoInclude?.length ? `Target geographies: ${geoInclude.join(', ')}${geoExclude?.length ? ` | Excluded: ${geoExclude.join(', ')}` : ''}` : '',
        preferredPlatforms?.length ? `Preferred platforms: ${preferredPlatforms.join(', ')}` : '',
        targetAudience ? `Target audience: ${targetAudience}` : '',
        websiteAnalysis
          ? `\n## Website Analysis\n${websiteAnalysis.slice(0, 500)}`
          : '\n## Website Analysis\n(not yet generated — guide user to complete onboarding)',
        strategyNarrative
          ? `\n## Approved Strategy Narrative\n${strategyNarrative.slice(0, 500)}`
          : '\n## Approved Strategy Narrative\n(not yet generated — guide user to complete onboarding first)',
        strategyPlatforms?.length
          ? `\n## Platform Budget Allocation (Approved Strategy)\n${strategyPlatforms.map(p => `  ${p.name}: ${p.budget_percentage}% — ${p.reasoning.slice(0, 100)}`).join('\n')}`
          : '',
        '',
        '## Performance — Last 7 Days (GA4 ground truth, not platform self-reported)',
        ga4Line,
        '',
        `## Campaigns (${campaigns.length} total — ${active.length} active, ${paused.length} paused)`,
        `Format: [ID] Name | platform | status | daily budget`,
        campaignLines,
        '',
        `## Pending Approvals (${pendingProtocols.length})`,
        protocolLines,
        '',
        '## Recent AI Actions (last 5)',
        auditLines,
        '',
        '## Active Industry News',
        newsLines,
        '',
        '## Social Media',
        socialLine,
        socialSettings?.facebook_page_id ? `Facebook Page ID: ${socialSettings.facebook_page_id}` : 'Facebook Page ID: (not set)',
        socialSettings?.instagram_user_id ? `Instagram User ID: ${socialSettings.instagram_user_id}` : 'Instagram User ID: (not set)',
        '',
        '## Meta Ad Account (for paid campaigns)',
        selectedAdAccount
          ? `Selected: ${selectedAdAccount}`
          : 'Selected: (none — Vigmis will fall back to the first ad account Meta returns, which may be wrong for users with multiple accounts)',
        '',
        `## Social Posts (most recent ${posts.length})`,
        `Format: [POST_ID] platform | pillar | status | scheduled_for | "content preview"`,
        postLines,
        '',
        '## Brand Assets',
        `Format: [kind] filename — URL`,
        assetLines,
        pageContext ? `\n## Page Context\n${neutralizeActionTags(pageContext).slice(0, 400)}` : '',
      ].join('\n');

      // Hard language override: detect current message script server-side
      const _isArabic = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(message);
      const _isHebrew = /[֐-׿]/.test(message);
      const langOverride = _isArabic
        ? '\n\n⚠️ MANDATORY: The client is writing in Arabic. YOUR ENTIRE RESPONSE MUST BE IN ARABIC.'
        : _isHebrew
        ? '\n\n⚠️ MANDATORY: The client is writing in Hebrew. YOUR ENTIRE RESPONSE MUST BE IN HEBREW.'
        : '\n\n⚠️ MANDATORY: The client is writing in English. YOUR ENTIRE RESPONSE MUST BE IN ENGLISH.';

      const systemWithContext = SYSTEM_PROMPT + '\n\n' + clientContext + langOverride;

      const messages = [
        ...pastMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          // Re-tag any historical content; only this turn's model output may carry real tags.
          content: m.role === 'assistant' ? m.content : neutralizeActionTags(m.content),
        })),
        { role: 'user' as const, content: neutralizeActionTags(message) },
      ];

      // Degraded mode: route to cheap model (gpt-4o-mini) instead of Sonnet
      const chatTask = quota.degrade ? 'cheap_task' : 'chat';
      const response = await route({ task: chatTask, messages, systemPrompt: systemWithContext });
      const rawOutput = response.output;

      // Meter this message against the monthly allowance + cost breaker.
      await recordAiCost(tenantId, response.costUsd, { messages: 1 }).catch(() => {});

      const parsedActions = parseActions(rawOutput);
      const executedActions = parsedActions.length > 0
        ? await executeActions(parsedActions, tenantId)
        : [];

      const visibleMessage = rawOutput
        .replace(/\[ACTION:[^\]]+\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      await db.from('chat_messages').insert([
        { tenant_id: tenantId, role: 'user', content: message },
        { tenant_id: tenantId, role: 'assistant', content: rawOutput },
      ]);

      return reply.send({ message: visibleMessage, executedActions });
    },
  );

  app.get<{ Querystring: { limit?: string } }>(
    '/chat/history',
    { preHandler: authenticate },
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit ?? 50), 100);
      const { data } = await db
        .from('chat_messages')
        .select('id, role, content, created_at')
        .eq('tenant_id', request.tenantId)
        .order('created_at', { ascending: true })
        .limit(limit);
      return reply.send(data ?? []);
    },
  );
}

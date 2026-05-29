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

type ExecutedAction = {
  type: string;
  campaign_id?: string;
  campaign_name?: string;
  post_id?: string;
  detail?: string;
  success: boolean;
};

// Action argument parser that respects pipes: [ACTION:type|arg1|arg2|...]
// Backwards compatible with the legacy colon form used for campaign actions.
function splitActionArgs(raw: string): { type: string; args: string[] } {
  if (raw.includes('|')) {
    const [type, ...args] = raw.split('|');
    return { type: type.trim(), args: args.map(a => a.trim()) };
  }
  const parts = raw.split(':');
  return { type: parts[0].trim(), args: parts.slice(1).map(a => a.trim()) };
}

function parseActions(text: string): Array<{ type: string; args: string[] }> {
  const regex = /\[ACTION:([^\]]+)\]/g;
  const results: Array<{ type: string; args: string[] }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push(splitActionArgs(match[1]));
  }
  return results;
}

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
          db.from('client_settings').select('website_url, website_analysis, goal, strategy_plan').eq('tenant_id', tenantId).maybeSingle(),
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

const SYSTEM_PROMPT = `You are VIGMIS — an expert AI marketing manager with direct control over this client's ad campaigns AND social media.

## What you can do
Execute real actions by embedding these tags anywhere in your response. They run immediately.

Campaign actions (legacy colon syntax):
- Pause a campaign:    [ACTION:pause_campaign:CAMPAIGN_ID]
- Resume a campaign:   [ACTION:resume_campaign:CAMPAIGN_ID]
- Change daily budget: [ACTION:update_budget:CAMPAIGN_ID:AMOUNT_IN_USD]
- Pause ALL campaigns: [ACTION:pause_all]
- Resume ALL campaigns: [ACTION:resume_all]

Social actions (pipe syntax — text may contain colons):
- Generate AI post:    [ACTION:create_post|PLATFORM|PILLAR]    (PLATFORM: facebook|instagram|tiktok ; PILLAR: educational|promotional|social_proof|behind_the_scenes|trending)
- Write a manual post: [ACTION:write_post|PLATFORM|PILLAR|FULL POST TEXT]
- Edit a post's text:  [ACTION:edit_post|POST_ID|NEW FULL TEXT]
- Attach an image URL: [ACTION:set_post_image|POST_ID|https://...]
- Approve a post:      [ACTION:approve_post|POST_ID]
- Reject a post:       [ACTION:reject_post|POST_ID|optional reason]
- Reschedule a post:   [ACTION:schedule_post|POST_ID|ISO_DATETIME]
- Set Meta Ad Account: [ACTION:select_ad_account|act_NUMERIC_ID]    (format: "act_" + digits)

## Rules
1. Only take action when the client explicitly asks. Never proactively change things.
2. Always explain what you're doing and why BEFORE the action tag.
3. For budget changes: state the old amount and new amount.
4. For pause_all: acknowledge it stops all advertising.
5. Never invent numbers, IDs, or URLs — only use values from the context below.
6. For edits/approvals/rejects, use the exact POST_ID from the Social Posts list.
7. If the user wants to upload an image, ask them to paste the public image URL (the action only accepts URLs, not files).
8. If the user describes a post idea in free text, decide: was it the literal copy (use write_post) or a brief (use create_post)? When in doubt, ask one short clarifying question first.
9. Reply in the same language the client uses (Hebrew or English).
10. If the user asks which ad account Vigmis is publishing into — check Selected Ad Account below. If it's blank or wrong, ask them to open Dashboard → Social → Connect → Meta Ad Account and pick one. If they give you an "act_..." ID directly, use select_ad_account.
11. Be direct and professional. This is a business tool.`;

export async function chatRoutes(app: FastifyInstance) {

  app.post<{ Body: { message: string; pageContext?: string } }>(
    '/chat',
    { preHandler: authenticate },
    async (request, reply) => {
      const { message, pageContext } = request.body ?? {};
      if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

      const tenantId = request.tenantId;

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
        return reply.send({
          response: intent.user_facing_response,
          actions: [],
          intent: {
            bucket: intent.bucket,
            reason: intent.reason,
            alternative: intent.alternative,
          },
        });
      }

      const [historyRes, campaignsRes, settingsRes, postsRes, socialSettingsRes, metaTokenRes] = await Promise.all([
        db.from('chat_messages').select('role, content').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(12),
        db.from('campaigns').select('id, name, platform, status, daily_budget_usd, campaign_type').eq('tenant_id', tenantId).limit(30),
        db.from('client_settings').select('goal, budget_monthly_ils, management_percentage, website_url, risk_level').eq('tenant_id', tenantId).maybeSingle(),
        db.from('social_posts').select('id, platform, pillar, status, content, scheduled_for').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(20),
        db.from('social_settings').select('enabled, platforms, approval_mode, content_pillars, facebook_page_id, instagram_user_id').eq('tenant_id', tenantId).maybeSingle(),
        db.from('platform_tokens').select('account_id').eq('tenant_id', tenantId).eq('platform', 'meta').maybeSingle(),
      ]);

      const pastMessages = (historyRes.data ?? []).reverse();
      const campaigns = campaignsRes.data ?? [];
      const settings = settingsRes.data;
      const posts = postsRes.data ?? [];
      const socialSettings = socialSettingsRes.data;
      const selectedAdAccount = metaTokenRes.data?.account_id ?? null;

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

      const clientContext = [
        '## Client',
        settings
          ? `Goal: ${settings.goal} | Budget: ILS ${settings.budget_monthly_ils} (~$${Math.round(settings.budget_monthly_ils / 3.7)}/mo) | Vigmis manages: ${settings.management_percentage}% | Website: ${settings.website_url} | Risk: ${settings.risk_level}`
          : 'No settings yet',
        '',
        `## Campaigns (${campaigns.length} total — ${active.length} active, ${paused.length} paused)`,
        `Format: [ID] Name | platform | status | daily budget`,
        campaignLines,
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
        pageContext ? `\n## Page Context\n${pageContext.slice(0, 400)}` : '',
      ].join('\n');

      const systemWithContext = SYSTEM_PROMPT + '\n\n' + clientContext;

      const messages = [
        ...pastMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: message },
      ];

      const response = await route({ task: 'chat', messages, systemPrompt: systemWithContext });
      const rawOutput = response.output;

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

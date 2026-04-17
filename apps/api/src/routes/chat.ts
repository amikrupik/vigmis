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

type ExecutedAction = {
  type: string;
  campaign_id?: string;
  campaign_name?: string;
  detail?: string;
  success: boolean;
};

function parseActions(text: string): Array<{ type: string; args: string[] }> {
  const regex = /\[ACTION:([^\]]+)\]/g;
  const results: Array<{ type: string; args: string[] }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const parts = match[1].split(':');
    results.push({ type: parts[0], args: parts.slice(1) });
  }
  return results;
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

const SYSTEM_PROMPT = `You are VIGMIS — an expert AI marketing manager with direct control over this client's ad campaigns.

## What you can do
Execute real actions by embedding these tags anywhere in your response. They run immediately:
- Pause a campaign:  [ACTION:pause_campaign:CAMPAIGN_ID]
- Resume a campaign: [ACTION:resume_campaign:CAMPAIGN_ID]
- Change daily budget: [ACTION:update_budget:CAMPAIGN_ID:AMOUNT_IN_USD]
- Pause ALL campaigns: [ACTION:pause_all]
- Resume ALL campaigns: [ACTION:resume_all]

## Rules
1. Only take action when the client explicitly asks. Never proactively change things.
2. Always explain what you're doing and why before the action tag.
3. For budget changes: state the old amount and new amount.
4. For pause_all: acknowledge it stops all advertising.
5. Never invent numbers — only use data from the context below.
6. Reply in the same language the client uses (Hebrew or English).
7. For ROAS, CTR, CPA: explain these metrics will appear once Google/Meta API access is confirmed.
8. Be direct and professional. This is a business tool.`;

export async function chatRoutes(app: FastifyInstance) {

  app.post<{ Body: { message: string } }>(
    '/chat',
    { preHandler: authenticate },
    async (request, reply) => {
      const { message } = request.body ?? {};
      if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

      const tenantId = request.tenantId;

      const [historyRes, campaignsRes, settingsRes] = await Promise.all([
        db.from('chat_messages').select('role, content').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(12),
        db.from('campaigns').select('id, name, platform, status, daily_budget_usd, campaign_type').eq('tenant_id', tenantId).limit(30),
        db.from('client_settings').select('goal, budget_monthly_ils, management_percentage, website_url, risk_level').eq('tenant_id', tenantId).maybeSingle(),
      ]);

      const pastMessages = (historyRes.data ?? []).reverse();
      const campaigns = campaignsRes.data ?? [];
      const settings = settingsRes.data;

      const active = campaigns.filter(c => c.status === 'active');
      const paused = campaigns.filter(c => c.status === 'paused');

      const campaignLines = campaigns.length
        ? campaigns.map(c => `  [${c.id}] ${c.name} | ${c.platform} | ${c.status} | $${c.daily_budget_usd}/day`).join('\n')
        : '  (none yet)';

      const clientContext = [
        '## Client',
        settings
          ? `Goal: ${settings.goal} | Budget: ILS ${settings.budget_monthly_ils} (~$${Math.round(settings.budget_monthly_ils / 3.7)}/mo) | Vigmis manages: ${settings.management_percentage}% | Website: ${settings.website_url} | Risk: ${settings.risk_level}`
          : 'No settings yet',
        '',
        `## Campaigns (${campaigns.length} total — ${active.length} active, ${paused.length} paused)`,
        `Format: [ID] Name | platform | status | daily budget`,
        campaignLines,
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

// Chat routes
//
// POST /chat          — send a message, get AI response
// GET  /chat/history  — last N messages

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';

const SYSTEM_PROMPT = `You are VIGMIS — an AI marketing manager.
You manage Google Ads and Meta campaigns for the user.
Answer concisely in the same language the user writes in (Hebrew or English).
When asked to approve or reject an optimization suggestion, reply with a JSON action block:
{"action":"approve","optimizationId":"<id>"} or {"action":"reject","optimizationId":"<id>"}.
Otherwise reply naturally. Do not invent campaign data — only use what is provided in context.`;

export async function chatRoutes(app: FastifyInstance) {

  // ── Post a message ────────────────────────────────────────────────────────
  app.post<{ Body: { message: string } }>(
    '/chat',
    { preHandler: authenticate },
    async (request, reply) => {
      const { message } = request.body ?? {};
      if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

      const tenantId = request.tenantId;

      // Fetch last 10 turns for context
      const { data: history } = await db
        .from('chat_messages')
        .select('role, content')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);

      const pastMessages = (history ?? []).reverse();

      // Fetch campaign summary for context
      const { data: campaigns } = await db
        .from('campaigns')
        .select('name, platform, status, daily_budget_usd')
        .eq('tenant_id', tenantId)
        .limit(20);

      const campaignSummary = campaigns?.length
        ? `\nActive campaigns:\n${campaigns.map(c => `- ${c.name} (${c.platform}) status=${c.status} budget=$${c.daily_budget_usd}/day`).join('\n')}`
        : '\nNo campaigns yet.';

      // Fetch pending optimization approvals
      const { data: pendingOpts } = await db
        .from('optimization_approvals')
        .select('id, campaign_id, action, reason')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .limit(5);

      const optSummary = pendingOpts?.length
        ? `\nPending optimization approvals:\n${pendingOpts.map(o => `- id=${o.id} action=${o.action} reason: ${o.reason}`).join('\n')}`
        : '';

      const systemWithContext = SYSTEM_PROMPT + campaignSummary + optSummary;

      // Build messages array
      const messages = [
        ...pastMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: message },
      ];

      const response = await route({
        task: 'chat',
        messages,
        systemPrompt: systemWithContext,
      });

      const assistantText = response.output;

      // Persist both turns
      await db.from('chat_messages').insert([
        { tenant_id: tenantId, role: 'user',      content: message },
        { tenant_id: tenantId, role: 'assistant', content: assistantText },
      ]);

      // Check if response contains an action
      let parsedAction: object | null = null;
      const jsonMatch = assistantText.match(/\{[\s\S]*"action"[\s\S]*\}/);
      if (jsonMatch) {
        try { parsedAction = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
      }

      return reply.send({ message: assistantText, action: parsedAction });
    },
  );

  // ── History ───────────────────────────────────────────────────────────────
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

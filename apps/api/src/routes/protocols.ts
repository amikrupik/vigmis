// Decision Protocols — full audit trail of every Vigmis recommendation and client decision.
//
// GET  /protocols              — list protocols for this tenant (pending first)
// GET  /protocols/:id          — single protocol with full conversation
// POST /protocols/:id/reply    — client adds a message to the conversation
// POST /protocols/:id/approve  — client formally approves with final confirmation text
// POST /protocols/:id/reject   — client rejects

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { assertCronSecret } from '../middleware/secrets.js';
import { route } from '@vigmis/ai-router';
import { sendTenantNotification } from '../services/notify.js';
import { applyBenchmarkRecalibration } from '../optimization/recalibration.js';
import { scheduleOutcomeCheck } from '../optimization/outcome-tracker.js';

export async function protocolRoutes(app: FastifyInstance) {

  // List protocols — pending first, then recent
  app.get('/protocols', { preHandler: authenticate }, async (request, reply) => {
    const { status } = request.query as any;

    let q = db
      .from('decision_protocols')
      .select('id, type, status, title, approval_summary, platform, campaign_id, created_at, expires_at, resolved_at')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);

    const { data } = await q.limit(50);
    return reply.send({ protocols: data ?? [] });
  });

  // Single protocol with full conversation
  app.get('/protocols/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { data } = await db
      .from('decision_protocols')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!data) return reply.code(404).send({ error: 'Not found' });
    return reply.send(data);
  });

  // Client replies — adds message and Vigmis responds
  app.post('/protocols/:id/reply', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { message } = request.body as any;
    if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

    const { data: protocol } = await db
      .from('decision_protocols')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!protocol) return reply.code(404).send({ error: 'Not found' });
    if (protocol.status === 'approved' || protocol.status === 'rejected') {
      return reply.code(400).send({ error: 'Protocol already resolved' });
    }

    const now = new Date().toISOString();
    const conversation = (protocol.conversation ?? []) as any[];

    // Add client message
    conversation.push({ role: 'client', content: message, timestamp: now });

    // Generate Vigmis response
    const history = conversation
      .slice(0, -1)
      .map((m: any) => `${m.role === 'vigmis' ? 'Vigmis' : 'Client'}: ${m.content}`)
      .join('\n\n');

    const aiRes = await route({
      task: 'analysis',
      prompt: `You are Vigmis, an honest marketing advisor. You made a recommendation to a client and they are now asking questions or responding.

YOUR ORIGINAL RECOMMENDATION:
${protocol.recommendation}

CONVERSATION SO FAR:
${history}

CLIENT'S LATEST MESSAGE:
${message}

Respond honestly and directly. If the client disagrees, engage with their specific concern. If they agree, acknowledge it. If they ask a question, answer it specifically. Keep it to 2-4 sentences. End with either:
- A clear question if you need more info before they can decide
- Or a clear statement that they can now approve or reject`,
      systemPrompt: 'You are Vigmis, an honest marketing advisor. Be direct, specific, and concise.',
      options: { maxTokens: 350, temperature: 0.5 },
    });

    conversation.push({ role: 'vigmis', content: aiRes.output, timestamp: new Date().toISOString() });

    await db.from('decision_protocols').update({
      conversation,
      status: 'in_discussion',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    return reply.send({ vigmisResponse: aiRes.output, conversation });
  });

  // Client formally approves
  app.post('/protocols/:id/approve', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const { data: protocol } = await db
      .from('decision_protocols')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!protocol) return reply.code(404).send({ error: 'Not found' });
    if (protocol.status === 'approved') return reply.send({ success: true, alreadyApproved: true });

    const now = new Date().toISOString();
    const conversation = (protocol.conversation ?? []) as any[];
    conversation.push({
      role: 'client',
      content: `[APPROVED] ${protocol.approval_text}`,
      timestamp: now,
    });

    await db.from('decision_protocols').update({
      status: 'approved',
      resolved_at: now,
      resolved_by: 'client',
      conversation,
      updated_at: now,
    }).eq('id', id);

    // Audit log
    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: `protocol.approved`,
      platform: protocol.platform ?? null,
      actor: 'user',
      payload: {
        protocolId: id,
        type: protocol.type,
        title: protocol.title,
        approvalText: protocol.approval_text,
        actionPayload: protocol.action_payload,
      },
    });

    // Execute the action if applicable
    const payload = protocol.action_payload as any;
    if (protocol.type === 'campaign_pause' && payload?.campaignId) {
      await db.from('campaigns')
        .update({ status: 'paused', updated_at: now })
        .eq('id', payload.campaignId)
        .eq('tenant_id', request.tenantId);
    }
    if ((protocol.type === 'budget_change' || protocol.type === 'campaign_scale') && payload?.campaignId && payload?.newBudgetUsd) {
      await db.from('campaigns')
        .update({ daily_budget_usd: payload.newBudgetUsd, updated_at: now })
        .eq('id', payload.campaignId)
        .eq('tenant_id', request.tenantId);
    }
    if (protocol.type === 'campaign_resume' && payload?.campaignId) {
      await db.from('campaigns')
        .update({ status: 'active', updated_at: now })
        .eq('id', payload.campaignId)
        .eq('tenant_id', request.tenantId);
    }

    // Benchmark recalibration — apply new thresholds to client_settings
    if (payload?.type === 'benchmark_recalibration' && Array.isArray(payload.suggestions)) {
      await applyBenchmarkRecalibration(request.tenantId, payload.suggestions as any).catch(() => {});
    }

    // Strategy patch — merge additions into strategy_plan
    if (protocol.type === 'strategy_patch' && payload?.additions) {
      try {
        const { data: cs } = await db
          .from('client_settings')
          .select('strategy_plan')
          .eq('tenant_id', request.tenantId)
          .maybeSingle();
        const plan = (cs?.strategy_plan ?? {}) as Record<string, any>;

        const additions = payload.additions as Record<string, any>;

        // Merge arrays — append new items without duplicates (by name field)
        if (Array.isArray(additions.new_segments)) {
          const existing: any[] = plan.market_segments ?? [];
          const newNames = new Set(additions.new_segments.map((s: any) => s.segment_name));
          plan.market_segments = [...existing.filter(s => !newNames.has(s.segment_name)), ...additions.new_segments];
        }
        if (Array.isArray(additions.new_competitors)) {
          const existing: any[] = plan.real_competitors ?? [];
          const newNames = new Set(additions.new_competitors.map((c: any) => c.name));
          plan.real_competitors = [...existing.filter(c => !newNames.has(c.name)), ...additions.new_competitors];
        }
        if (Array.isArray(additions.new_hooks) && Array.isArray(plan.creative_brief)) {
          plan.creative_brief = plan.creative_brief.map((brief: any) => ({
            ...brief,
            hooks: [...(brief.hooks ?? []), ...additions.new_hooks],
          }));
        }
        if (additions.market_thesis_note) {
          plan.market_thesis = `${plan.market_thesis ?? ''}\n\n[Update ${new Date().toLocaleDateString()}]: ${additions.market_thesis_note}`.trim();
        }
        if (Array.isArray(additions.new_hypotheses)) {
          plan.strategic_hypotheses = [...(plan.strategic_hypotheses ?? []), ...additions.new_hypotheses];
        }
        // Append a note to open_notes for traceability
        plan._patch_notes = [...(plan._patch_notes ?? []), {
          date: now,
          trigger: payload.trigger,
          description: payload.description,
        }];

        await db.from('client_settings')
          .update({ strategy_plan: plan, updated_at: now })
          .eq('tenant_id', request.tenantId);

        await db.from('audit_log').insert({
          tenant_id: request.tenantId,
          action: 'strategy.patch_applied',
          actor: 'user',
          payload: { protocolId: id, trigger: payload.trigger, description: payload.description },
        });
      } catch (err: unknown) {
        request.log.error({ err }, 'Failed to apply strategy patch');
      }
    }

    // Schedule outcome check — measure in 10 days whether this decision worked
    const measurableTypes = ['campaign_scale', 'budget_change', 'campaign_pause', 'campaign_resume', 'portfolio_reallocation'];
    if (measurableTypes.includes(protocol.type)) {
      scheduleOutcomeCheck(id, 10).catch(() => {});
    }

    return reply.send({ success: true, type: protocol.type, actionPayload: protocol.action_payload });
  });

  // Client rejects
  app.post('/protocols/:id/reject', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { reason } = request.body as any;

    const { data: protocol } = await db
      .from('decision_protocols')
      .select('id, type, platform, title')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!protocol) return reply.code(404).send({ error: 'Not found' });

    const now = new Date().toISOString();
    await db.from('decision_protocols').update({
      status: 'rejected',
      resolved_at: now,
      resolved_by: 'client',
      updated_at: now,
    }).eq('id', id);

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'protocol.rejected',
      platform: protocol.platform ?? null,
      actor: 'user',
      payload: { protocolId: id, type: protocol.type, title: protocol.title, reason: reason ?? null },
    });

    return reply.send({ success: true });
  });
}

// ── Cron: expire stale protocols ─────────────────────────────────────────────
// Called daily by scheduler — marks expired protocols and sends a final nudge

export async function expireProtocolsRoute(app: FastifyInstance) {
  app.post('/protocols/expire-all', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;

    const now = new Date().toISOString();

    // Find protocols that are past expires_at and still pending/in_discussion
    const { data: expired } = await db
      .from('decision_protocols')
      .select('id, tenant_id, title, type, platform')
      .in('status', ['pending', 'in_discussion'])
      .lt('expires_at', now);

    if (!expired?.length) return reply.send({ expired: 0 });

    for (const protocol of expired) {
      await db.from('decision_protocols').update({
        status: 'expired',
        resolved_at: now,
        resolved_by: 'system',
        updated_at: now,
      }).eq('id', protocol.id);

      await db.from('audit_log').insert({
        tenant_id: protocol.tenant_id,
        action: 'protocol.expired',
        platform: protocol.platform ?? null,
        actor: 'system',
        payload: { protocolId: protocol.id, title: protocol.title, type: protocol.type },
      });
    }

    return reply.send({ expired: expired.length });
  });
}

// ── Helper: create a protocol from the optimization engine or alerts ───────────

export async function createProtocol(params: {
  tenantId: string;
  type: string;
  title: string;
  recommendation: string;
  approvalText: string;
  approvalSummary?: string;
  actionPayload?: Record<string, unknown>;
  campaignId?: string;
  platform?: string;
}): Promise<string | null> {
  const { data, error } = await db.from('decision_protocols').insert({
    tenant_id: params.tenantId,
    type: params.type,
    title: params.title,
    recommendation: params.recommendation,
    approval_text: params.approvalText,
    approval_summary: params.approvalSummary,
    action_payload: params.actionPayload ?? {},
    campaign_id: params.campaignId ?? null,
    platform: params.platform ?? null,
    conversation: [{ role: 'vigmis', content: params.recommendation, timestamp: new Date().toISOString() }],
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select('id').single();

  if (error || !data) return null;
  return data.id;
}

// Policy routes — content classification + decision logging
//
// POST /policy/classify        → run a single piece of content through the classifier
// GET  /policy/decisions       → recent decisions for this tenant (audit)
// GET  /policy/decisions/:id   → fetch a specific decision (e.g. for support / dispute)
//
// All decisions are persisted to content_decisions, regardless of outcome.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import {
  classifyContent,
  sha256Hex,
  type ContentKind,
} from '../services/policy-classifier.js';

const ClassifyBody = z.object({
  text: z.string().min(1).max(20_000),
  kind: z.enum([
    'ad_copy','ad_creative','post','image_prompt',
    'video_script','landing_claim','onboarding_answer','chat_message','other',
  ]),
  market: z.string().length(2).optional(),
  business_country: z.string().length(2).optional(),
  industry: z.string().max(64).optional(),
  source: z.enum(['pre_flight','post_flight','onboarding','chat','manual_review']).default('pre_flight'),
});

export async function policyRoutes(app: FastifyInstance) {
  // ── POST /policy/classify ─────────────────────────────────────────────────
  app.post('/policy/classify', { preHandler: authenticate }, async (request, reply) => {
    const parse = ClassifyBody.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
    }
    const body = parse.data;

    const result = await classifyContent({
      text: body.text,
      kind: body.kind as ContentKind,
      market: body.market,
      business_country: body.business_country,
      industry: body.industry,
    });

    const contentHash = sha256Hex(body.text);

    const { data, error } = await db
      .from('content_decisions')
      .insert({
        tenant_id: request.tenantId,
        content_kind: body.kind,
        content_text: body.text,
        content_hash: contentHash,
        decision: result.decision,
        tier: result.tier,
        category: result.category,
        reason: result.reason,
        suggested_rewrite: result.suggested_rewrite,
        classifier_version: result.classifier_version,
        source: body.source,
        decided_by: result.decided_by,
        model_used: result.model_used,
        tokens_used: result.tokens_used,
        latency_ms: result.latency_ms,
      })
      .select('id, created_at')
      .single();

    if (error || !data) {
      request.log.error({ error }, 'Failed to persist policy decision');
      // Still return the result — the customer-facing answer matters more than the audit row.
      return reply.send({
        decision_id: null,
        ...result,
        content_hash: contentHash,
        persisted: false,
      });
    }

    return reply.send({
      decision_id: data.id,
      created_at: data.created_at,
      ...result,
      content_hash: contentHash,
      persisted: true,
    });
  });

  // ── GET /policy/decisions ─────────────────────────────────────────────────
  app.get('/policy/decisions', { preHandler: authenticate }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const onlyBlocked = query.only_blocked === 'true';

    let q = db
      .from('content_decisions')
      .select('id, content_kind, decision, tier, category, reason, source, created_at')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (onlyBlocked) {
      q = q.in('decision', ['block', 'require_human_review']);
    }

    const { data, error } = await q;
    if (error) {
      request.log.error({ error }, 'Failed to fetch decisions');
      return reply.code(500).send({ error: 'fetch_failed' });
    }
    return reply.send({ decisions: data ?? [] });
  });

  // ── GET /policy/decisions/:id ─────────────────────────────────────────────
  app.get('/policy/decisions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data, error } = await db
      .from('content_decisions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (error || !data) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send({ decision: data });
  });
}

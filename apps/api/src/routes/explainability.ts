// Explainability — full trace for any Vigmis decision.
//
// When a regulator, customer, or tribunal asks "why did Vigmis do/refuse X",
// this endpoint returns the complete audit trail:
//   - the content that was classified
//   - the classifier's verdict, reason, and model used
//   - the approval snapshot (if one exists) with hash + IP + UA
//   - the attestations the tenant signed
//   - any bypass attempts logged

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

export async function explainabilityRoutes(app: FastifyInstance) {
  // Full trace for a single classifier decision
  app.get('/audit/decisions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: decision } = await db.from('content_decisions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    if (!decision) {
      return reply.code(404).send({ error: 'not_found' });
    }

    // Find any approval_snapshots that reference this decision
    const { data: snapshots } = await db.from('approval_snapshots')
      .select('id, subject_kind, subject_id, content_hash, approver_clerk_user_id, approver_email, approval_method, client_ip, user_agent, created_at')
      .eq('related_decision_id', id)
      .eq('tenant_id', request.tenantId);

    return reply.send({
      decision,
      approval_snapshots: snapshots ?? [],
    });
  });

  // Full trace for a single approval snapshot
  app.get('/audit/snapshots/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data: snap } = await db.from('approval_snapshots')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    if (!snap) return reply.code(404).send({ error: 'not_found' });

    let relatedDecision = null;
    if (snap.related_decision_id) {
      const { data } = await db.from('content_decisions')
        .select('*')
        .eq('id', snap.related_decision_id)
        .eq('tenant_id', request.tenantId)
        .maybeSingle();
      relatedDecision = data;
    }

    let relatedAttestation = null;
    if (snap.attestation_id) {
      const { data } = await db.from('content_attestations')
        .select('*')
        .eq('id', snap.attestation_id)
        .eq('tenant_id', request.tenantId)
        .maybeSingle();
      relatedAttestation = data;
    }

    return reply.send({
      snapshot: snap,
      related_decision: relatedDecision,
      related_attestation: relatedAttestation,
    });
  });

  // Compliance summary — used for status checks + regulator requests
  app.get('/audit/compliance-summary', { preHandler: authenticate }, async (request, reply) => {
    const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    const [decisionsRes, snapshotsRes, attestationsRes, bypassRes] = await Promise.all([
      db.from('content_decisions')
        .select('decision', { count: 'exact', head: false })
        .eq('tenant_id', request.tenantId)
        .gte('created_at', since30d),
      db.from('approval_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', request.tenantId)
        .gte('created_at', since30d),
      db.from('content_attestations')
        .select('attestation_kind, signed_at')
        .eq('tenant_id', request.tenantId)
        .order('signed_at', { ascending: false }),
      db.from('bypass_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', request.tenantId)
        .gte('created_at', since30d),
    ]);

    const decisions = decisionsRes.data ?? [];
    const counts = {
      total: decisions.length,
      allowed: decisions.filter((d: { decision: string }) => d.decision === 'allow' || d.decision === 'allow_with_warning').length,
      blocked: decisions.filter((d: { decision: string }) => d.decision === 'block').length,
      requires_human: decisions.filter((d: { decision: string }) => d.decision === 'require_human_review').length,
      rewrites_suggested: decisions.filter((d: { decision: string }) => d.decision === 'rewrite_suggested').length,
    };

    return reply.send({
      window_days: 30,
      decisions: counts,
      approval_snapshots: snapshotsRes.count ?? 0,
      attestations_on_file: attestationsRes.data ?? [],
      bypass_attempts: bypassRes.count ?? 0,
    });
  });
}

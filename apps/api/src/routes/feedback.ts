// Feedback routes
//
// GET  /feedback/pending  — returns a prompt if one is due, else null
// POST /feedback/submit   — save feedback (rating + comment)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

const PERIODIC_DAYS = 14; // ask again every 14 days after first feedback

export async function feedbackRoutes(app: FastifyInstance) {

  // ── Pending prompt ────────────────────────────────────────────────────────
  app.get('/feedback/pending', { preHandler: authenticate }, async (request, reply) => {
    const { data: tenant } = await db
      .from('tenants')
      .select('last_feedback_at, onboarded_at, created_at')
      .eq('id', request.tenantId)
      .single();

    if (!tenant) return reply.send(null);

    const now = new Date();

    // Day-7 trigger: onboarded 7+ days ago, never gave feedback
    const referenceDate = tenant.onboarded_at
      ? new Date(tenant.onboarded_at)
      : new Date(tenant.created_at);

    const daysSinceOnboarding = (now.getTime() - referenceDate.getTime()) / 86_400_000;

    if (!tenant.last_feedback_at && daysSinceOnboarding >= 7) {
      return reply.send({ trigger: 'day7', question: 'How is VIGMIS working for you so far?' });
    }

    // Periodic trigger: 14+ days since last feedback
    if (tenant.last_feedback_at) {
      const daysSinceLast = (now.getTime() - new Date(tenant.last_feedback_at).getTime()) / 86_400_000;
      if (daysSinceLast >= PERIODIC_DAYS) {
        return reply.send({ trigger: 'periodic', question: 'Quick check-in — how is VIGMIS performing for you?' });
      }
    }

    return reply.send(null);
  });

  // ── Submit feedback ───────────────────────────────────────────────────────
  app.post<{ Body: { trigger: string; rating: number; comment?: string; followup?: string } }>(
    '/feedback/submit',
    { preHandler: authenticate },
    async (request, reply) => {
      const { trigger, rating, comment, followup } = request.body ?? {};
      if (!trigger || !rating) return reply.code(400).send({ error: 'trigger and rating required' });

      await db.from('feedback').insert({
        tenant_id: request.tenantId,
        trigger,
        rating,
        comment: comment ?? null,
        followup: followup ?? null,
      });

      // Update last_feedback_at
      await db
        .from('tenants')
        .update({ last_feedback_at: new Date().toISOString() })
        .eq('id', request.tenantId);

      return reply.send({ ok: true });
    },
  );
}

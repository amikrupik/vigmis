// Admin routes — Kill Switch + tenant management.
//
// Protected by ADMIN_SECRET header (not Clerk). For Vigmis-internal use only,
// e.g. support staff freezing a tenant during a violation review.
//
// POST /admin/tenants/:id/freeze    → freeze a tenant
// POST /admin/tenants/:id/unfreeze  → unfreeze
// GET  /admin/tenants/:id/state     → freeze + trust tier + recent decisions

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '@vigmis/db';
import { safeEqual } from '../middleware/secrets.js';

const FreezeBody = z.object({
  reason: z.string().min(1).max(500),
  capabilities: z.array(z.enum(['publish', 'optimize', 'generation', 'crons'])).optional(),
});

function adminAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  const provided = (req.headers['x-admin-secret'] as string) ?? '';
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !safeEqual(provided, expected)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export async function adminRoutes(app: FastifyInstance) {
  app.post('/admin/tenants/:id/freeze', async (request, reply) => {
    if (!adminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const parse = FreezeBody.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
    }
    const adminId = (request.headers['x-admin-id'] as string) ?? 'unknown';
    const now = new Date().toISOString();
    const { error } = await db.from('tenants').update({
      frozen: true,
      freeze_reason: parse.data.reason,
      freeze_capabilities: parse.data.capabilities ?? ['publish', 'optimize', 'generation', 'crons'],
      frozen_at: now,
      frozen_by: adminId,
    }).eq('id', id);
    if (error) {
      request.log.error({ err: error }, '[admin] freeze failed');
      return reply.code(500).send({ error: 'freeze_failed' });
    }
    await db.from('audit_log').insert({
      tenant_id: id,
      action: 'admin.tenant_frozen',
      actor: 'admin',
      payload: { reason: parse.data.reason, capabilities: parse.data.capabilities, admin: adminId },
    });
    return reply.send({ success: true, frozen_at: now });
  });

  app.post('/admin/tenants/:id/unfreeze', async (request, reply) => {
    if (!adminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const adminId = (request.headers['x-admin-id'] as string) ?? 'unknown';
    const { error } = await db.from('tenants').update({
      frozen: false,
      freeze_reason: null,
      freeze_capabilities: null,
      frozen_at: null,
      frozen_by: null,
    }).eq('id', id);
    if (error) {
      request.log.error({ err: error }, '[admin] unfreeze failed');
      return reply.code(500).send({ error: 'unfreeze_failed' });
    }
    await db.from('audit_log').insert({
      tenant_id: id,
      action: 'admin.tenant_unfrozen',
      actor: 'admin',
      payload: { admin: adminId },
    });
    return reply.send({ success: true });
  });

  app.get('/admin/tenants/:id/state', async (request, reply) => {
    if (!adminAuth(request, reply)) return;
    const { id } = request.params as { id: string };

    const [tenantRes, trustRes, decisionsRes] = await Promise.all([
      db.from('tenants').select('id, frozen, freeze_reason, freeze_capabilities, frozen_at, frozen_by, created_at').eq('id', id).maybeSingle(),
      db.from('tenant_trust_tier').select('*').eq('tenant_id', id).maybeSingle(),
      db.from('content_decisions')
        .select('id, decision, tier, category, reason, created_at')
        .eq('tenant_id', id)
        .in('decision', ['block', 'require_human_review'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    return reply.send({
      tenant: tenantRes.data,
      trust_tier: trustRes.data,
      recent_blocks: decisionsRes.data ?? [],
    });
  });
}

/**
 * Helper for other routes to check if a tenant is frozen for a given action.
 * Returns true if action is blocked.
 */
export async function isFrozenFor(tenantId: string, capability: 'publish' | 'optimize' | 'generation' | 'crons'): Promise<{ frozen: boolean; reason: string | null }> {
  const { data } = await db.from('tenants')
    .select('frozen, freeze_capabilities, freeze_reason')
    .eq('id', tenantId)
    .maybeSingle();
  if (!data?.frozen) return { frozen: false, reason: null };
  const caps = (data.freeze_capabilities as string[] | null) ?? [];
  if (caps.length === 0 || caps.includes(capability)) {
    return { frozen: true, reason: data.freeze_reason ?? 'Tenant frozen by Vigmis admin' };
  }
  return { frozen: false, reason: null };
}

// Team management routes
//
// GET    /team              — list members + pending invites
// POST   /team/invite       — invite by email (checks seat limit)
// DELETE /team/invites/:id  — revoke a pending invite
// DELETE /team/members/:id  — remove a team member
// POST   /team/accept       — accept an invite { token } (called after sign-up)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { sendEmail } from '../services/notify.js';
import { PLAN_PRICING } from '../billing/pricing.js';
import crypto from 'node:crypto';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

async function getPlan(tenantId: string): Promise<'free' | 'pro'> {
  const { data } = await db
    .from('billing_customers')
    .select('plan')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data?.plan ?? 'free') as 'free' | 'pro';
}

async function seatCount(tenantId: string): Promise<number> {
  // Owner = 1, plus each team member
  const { count } = await db
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  return 1 + (count ?? 0);
}

export async function teamRoutes(app: FastifyInstance) {

  // ── List members + pending invites ─────────────────────────────────────────
  app.get('/team', { preHandler: authenticate }, async (req, reply) => {
    const [membersRes, invitesRes, tenantRes] = await Promise.all([
      db.from('team_members').select('id, clerk_user_id, role, created_at').eq('tenant_id', req.tenantId),
      db.from('team_invites').select('id, invitee_email, status, created_at, expires_at').eq('tenant_id', req.tenantId).eq('status', 'pending'),
      db.from('tenants').select('clerk_user_id, email').eq('id', req.tenantId).single(),
    ]);

    const plan = await getPlan(req.tenantId);
    const maxSeats = PLAN_PRICING[plan].maxUsers;
    const used = await seatCount(req.tenantId);

    return reply.send({
      owner: { clerk_user_id: tenantRes.data?.clerk_user_id, email: tenantRes.data?.email },
      members: membersRes.data ?? [],
      pendingInvites: invitesRes.data ?? [],
      seats: { used, max: maxSeats },
      plan,
    });
  });

  // ── Invite by email ────────────────────────────────────────────────────────
  app.post('/team/invite', { preHandler: authenticate }, async (req, reply) => {
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Invalid email address' });
    }

    // Check seat limit
    const plan = await getPlan(req.tenantId);
    const maxSeats = PLAN_PRICING[plan].maxUsers;
    const used = await seatCount(req.tenantId);
    if (used >= maxSeats) {
      return reply.code(403).send({
        error: `Your ${plan === 'pro' ? 'Scale' : 'Grow'} plan allows ${maxSeats} seat${maxSeats === 1 ? '' : 's'}. Upgrade to add more team members.`,
      });
    }

    // Check not already a member or invited
    const { data: existing } = await db
      .from('team_invites')
      .select('id')
      .eq('tenant_id', req.tenantId)
      .eq('invitee_email', email)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) {
      return reply.code(409).send({ error: 'A pending invite already exists for this email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const { data: invite, error } = await db
      .from('team_invites')
      .insert({
        tenant_id: req.tenantId,
        invited_by_clerk_id: req.clerkUserId,
        invitee_email: email,
        token,
      })
      .select('id, invitee_email, created_at, expires_at')
      .single();

    if (error || !invite) {
      return reply.code(500).send({ error: 'Failed to create invite' });
    }

    // Send invite email
    const acceptUrl = `${WEB_URL}/join?token=${token}`;
    await sendEmail(
      email,
      'You have been invited to join a Vigmis workspace',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#1e293b;font-size:22px;margin-bottom:8px">You're invited to Vigmis</h2>
        <p style="color:#64748b;font-size:15px;line-height:1.6">Someone on your team has invited you to collaborate on a Vigmis workspace — AI-powered ad campaign management.</p>
        <div style="margin:28px 0">
          <a href="${acceptUrl}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block">Accept invitation →</a>
        </div>
        <p style="color:#94a3b8;font-size:12px">This invitation expires in 7 days. If you did not expect this, you can safely ignore this email.</p>
      </div>`,
    );

    return reply.code(201).send(invite);
  });

  // ── Revoke a pending invite ────────────────────────────────────────────────
  app.delete('/team/invites/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { error } = await db
      .from('team_invites')
      .update({ status: 'revoked' })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .eq('status', 'pending');

    if (error) return reply.code(500).send({ error: 'Failed to revoke invite' });
    return reply.send({ ok: true });
  });

  // ── Remove a team member ───────────────────────────────────────────────────
  app.delete('/team/members/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { error } = await db
      .from('team_members')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    if (error) return reply.code(500).send({ error: 'Failed to remove member' });
    return reply.send({ ok: true });
  });

  // ── Accept an invitation ───────────────────────────────────────────────────
  // Called from the /join page after the user is authenticated in Clerk.
  app.post('/team/accept', { preHandler: authenticate }, async (req, reply) => {
    const { token } = req.body as { token?: string };
    if (!token) return reply.code(400).send({ error: 'Missing token' });

    // Validate invite
    const { data: invite } = await db
      .from('team_invites')
      .select('id, tenant_id, status, expires_at, invitee_email')
      .eq('token', token)
      .maybeSingle();

    if (!invite) return reply.code(404).send({ error: 'Invitation not found' });
    if (invite.status !== 'pending') return reply.code(409).send({ error: `Invitation is already ${invite.status}` });
    if (new Date(invite.expires_at) < new Date()) {
      await db.from('team_invites').update({ status: 'expired' }).eq('id', invite.id);
      return reply.code(410).send({ error: 'Invitation has expired' });
    }

    // Check the accepting user doesn't already have their own tenant
    const { data: ownTenant } = await db
      .from('tenants')
      .select('id')
      .eq('clerk_user_id', req.clerkUserId)
      .maybeSingle();

    if (ownTenant) {
      return reply.code(409).send({
        error: 'Your Clerk account already has its own Vigmis workspace. Contact support to merge accounts.',
      });
    }

    // Check seat limit on the target tenant
    const targetPlan = await getPlan(invite.tenant_id);
    const maxSeats = PLAN_PRICING[targetPlan].maxUsers;
    const used = await seatCount(invite.tenant_id);
    if (used >= maxSeats) {
      return reply.code(403).send({ error: 'The workspace has reached its seat limit. Ask the owner to upgrade to Scale.' });
    }

    // Add to team_members
    const { error } = await db.from('team_members').insert({
      tenant_id: invite.tenant_id,
      clerk_user_id: req.clerkUserId,
      role: 'member',
      invited_by: invite.invitee_email,
    });

    if (error) return reply.code(500).send({ error: 'Failed to join workspace' });

    // Mark invite accepted
    await db
      .from('team_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    return reply.send({ ok: true, tenantId: invite.tenant_id });
  });
}

// DELETE /account           — delete tenant data + schedule Clerk user deletion
// GET    /account/export     — export all tenant data as JSON
// POST   /account/contact    — contact form → send email to support
// POST   /account/unsubscribe — unsubscribe from alert emails (token-based, no auth)

import type { FastifyInstance } from 'fastify';
import { db, decryptToken } from '@vigmis/db';
import { createClerkClient } from '@clerk/backend';
import { authenticate } from '../middleware/auth.js';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Best-effort OAuth revocation across platforms.
// We don't fail the deletion if a platform returns an error — the token will be wiped
// from our DB anyway, and the user can manually remove the app from their account.
async function revokePlatformTokens(tenantId: string, log: (msg: string, err?: unknown) => void): Promise<void> {
  const { data: tokens } = await db
    .from('platform_tokens')
    .select('platform, access_token, refresh_token')
    .eq('tenant_id', tenantId);

  if (!tokens?.length) return;

  for (const t of tokens) {
    if (!t.access_token) continue;
    let access: string;
    try { access = decryptToken(t.access_token); } catch { continue; }

    try {
      if (t.platform === 'meta') {
        // Removes Vigmis from facebook.com/settings/apps_and_websites for this user.
        await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${encodeURIComponent(access)}`, { method: 'DELETE' });
      } else if (t.platform === 'google') {
        // Revokes both Ads + Analytics scopes in one call.
        const tokenToRevoke = t.refresh_token ? decryptToken(t.refresh_token) : access;
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } else if (t.platform === 'tiktok') {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        if (clientKey && clientSecret) {
          await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: access }),
          });
        }
      }
    } catch (err) {
      log(`revoke failed for ${t.platform}`, err);
    }
  }
}

async function sendEmail(to: string, subject: string, html: string, from = 'hello@vigmis.com', fromName = 'Vigmis'): Promise<void> {
  const { SENDGRID_API_KEY } = process.env;
  if (!SENDGRID_API_KEY) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

export async function accountRoutes(app: FastifyInstance) {

  // ── Delete account ─────────────────────────────────────────────────────────
  // Full self-service GDPR/Meta-compliant deletion. Order matters:
  //   1. Pause active campaigns so we don't keep spending after the user is gone.
  //   2. Revoke OAuth at each platform (removes Vigmis from their FB/Google settings).
  //   3. Delete the Clerk user (best effort — keeps going if it fails).
  //   4. DELETE FROM tenants — every per-tenant table has ON DELETE CASCADE.
  app.delete('/account', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;
    const clerkUserId = request.clerkUserId;
    const errors: string[] = [];
    const log = (msg: string, err?: unknown) => {
      request.log.warn({ err }, msg);
      errors.push(msg + (err instanceof Error ? `: ${err.message}` : ''));
    };

    // 1. Pause campaigns so spending stops even if a platform revoke fails.
    try {
      await db.from('campaigns').update({ status: 'paused' }).eq('tenant_id', tenantId);
    } catch (err) { log('campaign pause failed', err); }

    // 2. Revoke OAuth across all connected platforms — Meta, Google, TikTok.
    await revokePlatformTokens(tenantId, log);

    // 3. Drop Clerk user (so a fresh signup with the same email starts clean).
    try {
      const clerkSecret = process.env.CLERK_SECRET_KEY;
      if (clerkSecret && clerkUserId) {
        const clerk = createClerkClient({ secretKey: clerkSecret });
        await clerk.users.deleteUser(clerkUserId);
      }
    } catch (err) { log('clerk delete failed', err); }

    // 4. Mark deletion in audit_log BEFORE the cascade wipes it (so it's at least in our logs).
    try {
      await db.from('audit_log').insert({
        tenant_id: tenantId,
        action: 'account.deleted',
        actor: 'user',
        payload: { at: new Date().toISOString(), errors },
      });
    } catch { /* not critical */ }

    // 5. Hard delete: every per-tenant table is ON DELETE CASCADE from tenants(id).
    try {
      const { error } = await db.from('tenants').delete().eq('id', tenantId);
      if (error) throw error;
    } catch (err) {
      log('tenant delete failed', err);
      return reply.code(500).send({ error: 'Deletion partially failed', details: errors });
    }

    return reply.send({
      success: true,
      message: 'Your account has been deleted. Vigmis has been disconnected from Facebook, Google, and TikTok. All campaign data has been removed.',
      revocation_warnings: errors.length ? errors : undefined,
    });
  });

  // ── Export data ────────────────────────────────────────────────────────────
  app.get('/account/export', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const [settingsRes, campaignsRes, alertsRes, auditRes] = await Promise.all([
      db.from('client_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      db.from('campaigns').select('name,platform,status,daily_budget_usd,created_at').eq('tenant_id', tenantId),
      db.from('alert_settings').select('email,whatsapp,email_enabled,whatsapp_enabled').eq('tenant_id', tenantId).maybeSingle(),
      db.from('audit_log').select('action,actor,created_at,payload').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      settings: settingsRes.data ?? null,
      campaigns: campaignsRes.data ?? [],
      alert_settings: alertsRes.data ?? null,
      audit_log: auditRes.data ?? [],
    };

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="vigmis-export-${tenantId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`)
      .send(exportData);
  });

  // ── Contact form ───────────────────────────────────────────────────────────
  app.post('/account/contact', async (request, reply) => {
    const { name, email, subject, category, message } = request.body as Record<string, string>;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return reply.code(400).send({ error: 'name, email, and message are required' });
    }

    const categoryRoutes: Record<string, string> = {
      billing: 'billing@vigmis.com',
      bug: 'bugs@vigmis.com',
      partnership: 'partners@vigmis.com',
      legal: 'legal@vigmis.com',
    };
    const toAddress = categoryRoutes[category ?? ''] ?? 'hello@vigmis.com';
    const displayCategory = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'General';

    // Send to support team
    await sendEmail(
      toAddress,
      `[Vigmis Support] ${displayCategory}: ${subject ?? message.slice(0, 60)}`,
      `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1e293b">New Contact Form Submission</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;font-weight:600;color:#475569;width:120px">Name</td><td style="padding:8px">${name}</td></tr>
          <tr><td style="padding:8px;font-weight:600;color:#475569">Email</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px;font-weight:600;color:#475569">Category</td><td style="padding:8px">${displayCategory}</td></tr>
          <tr><td style="padding:8px;font-weight:600;color:#475569">Subject</td><td style="padding:8px">${subject ?? '—'}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="white-space:pre-wrap;color:#1e293b">${message}</p>
      </div>`,
      'support@vigmis.com',
      'Vigmis Support',
    );

    // Auto-reply to sender
    await sendEmail(
      email,
      'We received your message — Vigmis Support',
      `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1e293b">Hi ${name},</h2>
        <p>Thank you for reaching out. We received your message and will respond within <strong>1–2 business days</strong>.</p>
        <p style="color:#475569;font-size:14px">Your message:</p>
        <blockquote style="border-left:3px solid #e2e8f0;margin:0;padding:12px 16px;color:#64748b;font-size:14px">${message.slice(0, 400)}${message.length > 400 ? '...' : ''}</blockquote>
        <p style="margin-top:24px">If your issue is urgent, please use the AI assistant inside your <a href="${WEB_URL}/dashboard" style="color:#4f46e5">dashboard</a>.</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">— The Vigmis Team<br>hello@vigmis.com</p>
      </div>`,
    );

    return reply.send({ success: true });
  });

  // ── Unsubscribe (no auth — token = tenantId) ───────────────────────────────
  app.post('/account/unsubscribe', async (request, reply) => {
    const { token } = request.body as { token?: string };
    if (!token) return reply.code(400).send({ error: 'token required' });

    const { error } = await db
      .from('alert_settings')
      .update({ email_enabled: false })
      .eq('tenant_id', token);

    if (error) return reply.code(400).send({ error: 'Invalid token' });
    return reply.send({ success: true });
  });
}

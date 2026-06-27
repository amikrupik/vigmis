// Inbound webhooks from external monitoring services and Clerk.
//
// POST /webhooks/instatus?secret=<INSTATUS_WEBHOOK_SECRET>
//   — Instatus monitor-down / monitor-up / incident events
//   — Logs to audit_log + sends ops email alert
//
// POST /webhooks/clerk
//   — Clerk user lifecycle events (user.deleted)
//   — Verified via svix HMAC (CLERK_WEBHOOK_SECRET)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { sendEmail } from '../services/notify.js';
import { safeEqual } from '../middleware/secrets.js';
import { executeAccountDeletion } from '../services/account-deletion.js';
import crypto from 'crypto';

// Verify a Svix-signed Clerk webhook without an extra package.
// Svix signs: "{svix-id}.{svix-timestamp}.{rawBody}" with HMAC-SHA256.
// The secret starts with "whsec_" followed by base64-encoded key bytes.
function verifyClerkSignature(
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
  secret: string,
): boolean {
  const tsSeconds = parseInt(svixTimestamp, 10);
  if (isNaN(tsSeconds) || Math.abs(Math.floor(Date.now() / 1000) - tsSeconds) > 300) return false;

  const keyBytes = Buffer.from(
    secret.startsWith('whsec_') ? secret.slice(6) : secret,
    'base64',
  );
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', keyBytes).update(toSign).digest('base64');

  // svix-signature header: space-separated "v1,<base64sig>" values
  return svixSignature.split(' ').some(part => {
    const sigValue = part.startsWith('v1,') ? part.slice(3) : part;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'base64'),
        Buffer.from(sigValue, 'base64'),
      );
    } catch { return false; }
  });
}

const OPS_EMAIL = process.env.OPS_ALERT_EMAIL ?? 'ami@tmgt.co.il';
const WEB_URL   = process.env.WEB_URL ?? 'https://vigmis.com';

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/instatus', async (request, reply) => {
    // Simple shared-secret auth in query param (Instatus doesn't sign payloads).
    // Fail closed: if the secret isn't configured, the endpoint is locked.
    const secret = (request.query as Record<string, string>).secret ?? '';
    const expected = process.env.INSTATUS_WEBHOOK_SECRET;
    if (!expected || !safeEqual(secret, expected)) {
      return reply.code(401).send({ error: 'Invalid secret' });
    }

    const body = request.body as Record<string, any>;
    const event: string = body?.event ?? body?.type ?? 'unknown';
    const monitorName: string = body?.monitor?.name ?? body?.component?.name ?? 'Unknown monitor';
    const monitorUrl: string  = body?.monitor?.url ?? '';

    const isDown     = event.includes('down')  || event.includes('MAJOROUTAGE') || event.includes('incident');
    const isResolved = event.includes('up')    || event.includes('OPERATIONAL') || event.includes('resolved');

    // Log to audit_log (no tenant — platform-level event)
    try {
      await db.from('audit_log').insert({
        tenant_id: '00000000-0000-0000-0000-000000000000',
        action: `instatus.${isDown ? 'down' : isResolved ? 'recovered' : 'event'}`,
        platform: 'instatus',
        actor: 'system',
        payload: body,
      });
    } catch { /* non-fatal */ }

    if (isDown) {
      await sendEmail(
        OPS_EMAIL,
        `🔴 VIGMIS DOWN: ${monitorName}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#ef4444;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">🔴 Service Down</h2>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
            <p style="font-size:16px;font-weight:bold;color:#1e293b">${monitorName}</p>
            ${monitorUrl ? `<p style="color:#64748b">${monitorUrl}</p>` : ''}
            <p style="color:#64748b">Event: ${event}</p>
            <p style="color:#64748b">Time: ${new Date().toISOString()}</p>
            <a href="${WEB_URL}/dashboard" style="display:inline-block;margin-top:12px;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Open Dashboard</a>
            <a href="https://vigmis.instatus.com" style="display:inline-block;margin-top:12px;margin-left:8px;background:#64748b;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Status Page</a>
          </div>
        </div>`,
      );
    } else if (isResolved) {
      await sendEmail(
        OPS_EMAIL,
        `✅ VIGMIS RECOVERED: ${monitorName}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#10b981;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">✅ Service Recovered</h2>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
            <p style="font-size:16px;font-weight:bold;color:#1e293b">${monitorName}</p>
            ${monitorUrl ? `<p style="color:#64748b">${monitorUrl}</p>` : ''}
            <p style="color:#64748b">Recovered at: ${new Date().toISOString()}</p>
          </div>
        </div>`,
      );
    }

    return reply.code(200).send({ received: true, event });
  });

  // ── Clerk user lifecycle webhooks ──────────────────────────────────────────
  // Register the endpoint in Clerk Dashboard → Webhooks → Add endpoint:
  //   URL: https://vigmisapi-production.up.railway.app/webhooks/clerk
  //   Events: user.deleted
  //   After saving, copy the "Signing Secret" and set CLERK_WEBHOOK_SECRET in Railway.
  app.post('/webhooks/clerk', async (request, reply) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      // Fail-closed: accepting unsigned webhooks would allow anyone to trigger account deletion.
      request.log.error('CLERK_WEBHOOK_SECRET not set — refusing Clerk webhook to prevent unsigned deletion attacks');
      return reply.code(500).send({ error: 'Webhook not configured' });
    }

    const svixId        = request.headers['svix-id'] as string | undefined;
    const svixTimestamp = request.headers['svix-timestamp'] as string | undefined;
    const svixSignature = request.headers['svix-signature'] as string | undefined;
    const rawBody       = (request as unknown as { rawBody?: string }).rawBody ?? '';

    if (!svixId || !svixTimestamp || !svixSignature) {
      return reply.code(400).send({ error: 'Missing svix headers' });
    }

    if (!verifyClerkSignature(svixId, svixTimestamp, svixSignature, rawBody, secret)) {
      return reply.code(401).send({ error: 'Invalid webhook signature' });
    }

    const body = request.body as Record<string, any>;
    const eventType: string = body?.type ?? '';

    if (eventType === 'user.deleted') {
      const clerkUserId: string = body?.data?.id ?? '';
      if (!clerkUserId) {
        return reply.code(400).send({ error: 'Missing user id in payload' });
      }

      // Find the tenant — may already be gone if user deleted via Vigmis UI first.
      const { data: tenant } = await db
        .from('tenants')
        .select('id')
        .eq('clerk_user_id', clerkUserId)
        .maybeSingle();

      if (!tenant) {
        // Already deleted — nothing to do.
        return reply.code(200).send({ received: true, action: 'noop' });
      }

      // clerkUserId is already deleted in Clerk — pass null to skip re-deletion.
      const result = await executeAccountDeletion(tenant.id, null);
      if (!result.success) {
        request.log.error({ errors: result.errors, clerkUserId }, 'Clerk user.deleted: account deletion partially failed');
      } else {
        request.log.info({ clerkUserId, tenantId: tenant.id }, 'Clerk user.deleted: tenant removed');
      }
    }

    return reply.code(200).send({ received: true, event: eventType });
  });

  // ── Meta deauthorization + GDPR data deletion ─────────────────────────────
  // Required by Meta App Review:
  //   • Deauthorization callback: fires when a user revokes app permissions
  //   • Data deletion callback: fires on GDPR erasure request
  // Both endpoints must exist and return 200 for Meta App Review to pass.
  app.post('/webhooks/meta', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const signedRequest: string | undefined = body?.signed_request;

    if (!signedRequest) {
      return reply.code(400).send({ error: 'Missing signed_request' });
    }

    // Decode the signed_request (format: base64url(signature).base64url(payload))
    const [, payloadB64] = signedRequest.split('.');
    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return reply.code(400).send({ error: 'Invalid signed_request' });
    }

    const metaUserId: string = payload?.user_id ?? '';

    if (metaUserId) {
      // Revoke stored Meta OAuth token for this user (best-effort)
      try {
        await db.from('oauth_tokens').delete().eq('platform', 'meta').like('access_token', `%${metaUserId}%`);
      } catch { /* non-fatal */ }
    }

    // Data deletion: return a confirmation URL (Meta checks it within 24h)
    const confirmationUrl = `${process.env.WEB_URL ?? 'https://vigmis.com'}/privacy/deletion-confirm?uid=${metaUserId}`;
    return reply.code(200).send({ url: confirmationUrl, confirmation_code: metaUserId });
  });
}

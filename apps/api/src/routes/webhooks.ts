// Inbound webhooks from external monitoring services.
//
// POST /webhooks/instatus?secret=<INSTATUS_WEBHOOK_SECRET>
//   — Instatus monitor-down / monitor-up / incident events
//   — Logs to audit_log + sends ops email alert

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { sendEmail } from '../services/notify.js';
import { safeEqual } from '../middleware/secrets.js';

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
}

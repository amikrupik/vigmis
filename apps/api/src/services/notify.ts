// Shared notification delivery — used by alerts.ts and engine.ts
// Sends WhatsApp (Twilio) + Email (SendGrid) based on tenant alert_settings

import { db } from '@vigmis/db';
import crypto from 'crypto';

export type NotifySeverity = 'critical' | 'warning' | 'info';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

async function sendWhatsApp(to: string, message: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_FROM;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) return;

  const from = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const body = new URLSearchParams({ From: from, To: toFmt, Body: message });

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
  );
}

function buildUnsubscribeToken(tenantId: string): string | null {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) return null; // omit footer rather than emit a broken unsubscribe link
  const hmac = crypto.createHmac('sha256', key).update(tenantId).digest('hex');
  return `${tenantId}.${hmac}`; // format expected by POST /account/unsubscribe
}

function withUnsubscribeFooter(html: string, tenantId: string): string {
  const token = buildUnsubscribeToken(tenantId);
  if (!token) return html; // no key — omit footer, email still delivers
  return `${html}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
  You're receiving this because you enabled email alerts in Vigmis.
  <a href="${WEB_URL}/unsubscribe?token=${token}" style="color:#94a3b8;text-decoration:underline;margin-left:4px">Unsubscribe</a>
</div>`;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  tenantId?: string,
): Promise<void> {
  const { SENDGRID_API_KEY } = process.env;
  if (!SENDGRID_API_KEY) return;

  const finalHtml = tenantId ? withUnsubscribeFooter(html, tenantId) : html;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'alerts@vigmis.com', name: 'Vigmis Alerts' },
      subject,
      content: [{ type: 'text/html', value: finalHtml }],
    }),
  });
}

// Format a short WhatsApp message (max 450 chars) from a potentially long notification.
// Critical alerts always use 🚨; warnings use ⚠️. Message body is truncated with ellipsis
// if it would push the total over the limit.
export function formatForWhatsApp(
  title: string,
  message: string,
  severity: NotifySeverity,
  actionText?: string,
): string {
  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  const footer = `\n\n→ ${WEB_URL}/dashboard`;
  const action = actionText ? `\n${actionText}` : '';

  // Use only the first line/paragraph of the message to keep it brief
  const firstParagraph = message.split(/\n\n/)[0]?.trim() ?? message.trim();

  const prefix = `${emoji} Vigmis Alert: ${title}\n\n`;
  const suffix = `${action}${footer}`;

  const maxBody = 450 - prefix.length - suffix.length;
  const body = firstParagraph.length <= maxBody
    ? firstParagraph
    : firstParagraph.slice(0, maxBody - 1) + '…';

  return `${prefix}${body}${suffix}`;
}

// Send a raw WhatsApp message to any phone number (exported for use outside notify.ts).
export async function sendWhatsAppRaw(to: string, message: string): Promise<void> {
  return sendWhatsApp(to, message);
}

// Send a notification to a tenant via all their enabled channels.
// Critical severity: WhatsApp fires as long as the tenant has a phone number on record
//   (opt-out model — they must actively disable to stop critical alerts).
// Warning severity: WhatsApp only fires when whatsapp_enabled is true (opt-in model).
// Info severity: silently dropped.
export async function sendTenantNotification(
  tenantId: string,
  title: string,
  message: string,
  severity: NotifySeverity,
  actionText?: string,
): Promise<void> {
  if (severity === 'info') return;

  const { data: settings } = await db
    .from('alert_settings')
    .select('email, whatsapp, email_enabled, whatsapp_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!settings) return;

  const whatsappMsg = formatForWhatsApp(title, message, severity, actionText);

  const borderColor = severity === 'critical' ? '#fecaca' : '#fde68a';
  const bgColor = severity === 'critical' ? '#fef2f2' : '#fffbeb';

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <img src="https://vigmis.com/logo.png" alt="Vigmis" width="100" style="margin-bottom:24px"/>
      <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:12px;padding:20px;margin-bottom:20px">
        <p style="font-weight:700;margin:0 0 8px;font-size:16px">${title}</p>
        <p style="margin:0;color:#374151;font-size:14px">${message}</p>
      </div>
      ${actionText ? `<p style="font-size:14px;color:#6b7280">→ ${actionText}</p>` : ''}
      <a href="https://vigmis.com/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:16px">Open Dashboard</a>
    </div>`;

  const promises: Promise<void>[] = [];

  // Critical: send WhatsApp if number exists (opt-out model).
  // Warning: send WhatsApp only if explicitly enabled (opt-in model).
  const shouldWhatsApp = settings.whatsapp && (
    severity === 'critical' ? true : settings.whatsapp_enabled
  );

  if (shouldWhatsApp) {
    promises.push(sendWhatsApp(settings.whatsapp as string, whatsappMsg));
  }

  if (settings.email_enabled && settings.email) {
    promises.push(sendEmail(settings.email, `Vigmis: ${title}`, emailHtml, tenantId));
  }

  await Promise.allSettled(promises);
}

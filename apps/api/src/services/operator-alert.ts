// Operator alerts — sent to Vigmis team (not tenants) when platform-level issues occur.
// Uses existing SendGrid + Twilio credentials.
// Optional: Telegram bot for instant mobile notifications.
//
// Required env vars (add to Railway):
//   OPERATOR_EMAIL       — e.g. ami@tmgt.co.il
//   OPERATOR_WHATSAPP    — e.g. +972501234567 (uses existing Twilio credentials)
//   OPERATOR_TELEGRAM_BOT_TOKEN  — from @BotFather
//   OPERATOR_TELEGRAM_CHAT_ID    — your personal chat ID with the bot

import { sendEmail } from './notify.js';

export type OperatorAlertSeverity = 'critical' | 'warning';

export interface OperatorAlertPayload {
  title: string;
  body: string;
  severity?: OperatorAlertSeverity;
  tenantId?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

export async function sendOperatorAlert(payload: OperatorAlertPayload): Promise<void> {
  const { title, body, severity = 'critical', tenantId, meta } = payload;
  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const metaLines = [
    tenantId ? `Tenant: ${tenantId}` : null,
    meta ? Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n') : null,
    `Time: ${timestamp}`,
  ].filter(Boolean).join('\n');

  const results = await Promise.allSettled([
    sendOperatorEmail(title, body, emoji, metaLines),
    sendTelegram(title, body, emoji, metaLines),
    sendOperatorWhatsApp(title, body, emoji, metaLines),
  ]);

  // Log failures silently — alerting should never crash the caller
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[operator-alert] delivery failed:', r.reason);
    }
  }
}

async function sendOperatorEmail(title: string, body: string, emoji: string, meta: string): Promise<void> {
  const to = process.env.OPERATOR_EMAIL;
  if (!to) return;

  const html = `
    <div style="font-family:monospace;max-width:600px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
      <p style="font-size:20px;font-weight:700;margin:0 0 16px">${emoji} ${title}</p>
      <pre style="background:#1e293b;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;margin:0 0 16px">${body}</pre>
      <pre style="font-size:11px;color:#64748b;margin:0">${meta}</pre>
      <a href="${process.env.WEB_URL ?? 'https://vigmis.com'}/admin" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:20px">Open Admin →</a>
    </div>`;

  await sendEmail(to, `${emoji} ${title}`, html);
}

async function sendTelegram(title: string, body: string, emoji: string, meta: string): Promise<void> {
  const token = process.env.OPERATOR_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OPERATOR_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text = `${emoji} *${escapeMarkdown(title)}*\n\n\`\`\`\n${body}\n\`\`\`\n\n_${escapeMarkdown(meta)}_`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  });
}

async function sendOperatorWhatsApp(title: string, body: string, emoji: string, meta: string): Promise<void> {
  const to = process.env.OPERATOR_WHATSAPP;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!to || !sid || !auth || !from) return;

  const message = `${emoji} *Vigmis Operator Alert*\n\n*${title}*\n\n${body}\n\n${meta}`;
  const fromFmt = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: fromFmt, To: toFmt, Body: message }).toString(),
  });
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

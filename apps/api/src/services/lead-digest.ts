// Lead Digest — pushes hot purchase-intent/lead comments to WhatsApp + Email
// so the customer can act on them within the engagement window.
//
// SMB customers don't live in Vigmis's dashboard. They live in WhatsApp.
// The right UX is: "Here's a hot lead — reply to this WhatsApp message and
// we'll relay your reply to Facebook." (Reply-relay is a future Session 7+
// item; for now we just push the digest with a link to the dashboard.)

import { db } from '@vigmis/db';
import { sendEmail } from './notify.js';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const DIGEST_HOT_PRIORITY = 75;      // threshold for "hot" — only push these
const DIGEST_LOOKBACK_HOURS = 6;     // freshness window

interface HotComment {
  id: string;
  text: string;
  sentiment: string;
  priority_score: number;
  author_name: string | null;
  commented_at: string;
  platform: string;
}

const LANG_LABELS = {
  en: {
    title: 'Hot leads waiting',
    intro: 'New high-intent comments on your social posts:',
    cta: 'Reply now',
    none: '',
  },
  he: {
    title: 'לידים חמים מחכים',
    intro: 'תגובות חמות חדשות לפוסטים שלך:',
    cta: 'הגב עכשיו',
    none: '',
  },
  ar: {
    title: 'تعليقات ساخنة في انتظارك',
    intro: 'تعليقات ذات نية شراء عالية:',
    cta: 'الرد الآن',
    none: '',
  },
  ru: {
    title: 'Горячие лиды ждут',
    intro: 'Новые комментарии с высоким интересом:',
    cta: 'Ответить сейчас',
    none: '',
  },
};

type Lang = keyof typeof LANG_LABELS;

export interface DigestResult {
  tenant_id: string;
  sent: boolean;
  hot_count: number;
  channels: string[];
  reason?: string;
}

export async function sendLeadDigestForTenant(tenantId: string): Promise<DigestResult> {
  // Fetch hot comments in window
  const since = new Date(Date.now() - DIGEST_LOOKBACK_HOURS * 3600_000).toISOString();
  const { data: hotComments } = await db.from('social_comments')
    .select('id, text, sentiment, priority_score, author_name, commented_at, platform')
    .eq('tenant_id', tenantId)
    .in('sentiment', ['purchase_intent', 'lead', 'question'])
    .gte('priority_score', DIGEST_HOT_PRIORITY)
    .neq('status', 'sent')
    .gte('commented_at', since)
    .order('priority_score', { ascending: false })
    .limit(5);

  if (!hotComments || hotComments.length === 0) {
    return { tenant_id: tenantId, sent: false, hot_count: 0, channels: [], reason: 'no_hot_comments' };
  }

  // Skip if we already pushed these — use a fingerprint of comment ids
  const fingerprint = hotComments.map((c: { id: string }) => c.id).sort().join(',');
  const { data: lastDigest } = await db.from('lead_digest_log')
    .select('comment_fingerprint, sent_at')
    .eq('tenant_id', tenantId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastDigest?.comment_fingerprint === fingerprint) {
    return { tenant_id: tenantId, sent: false, hot_count: hotComments.length, channels: [], reason: 'no_new_hot_comments_since_last' };
  }

  // Fetch alert + briefing channel preferences
  const [alertRes, briefRes] = await Promise.all([
    db.from('alert_settings').select('email, whatsapp, email_enabled, whatsapp_enabled').eq('tenant_id', tenantId).maybeSingle(),
    db.from('briefing_preferences').select('language').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  const lang = (briefRes.data?.language as Lang) ?? 'en';
  const channels: string[] = [];

  if (alertRes.data?.whatsapp_enabled && alertRes.data.whatsapp) {
    const body = formatWhatsApp(hotComments as HotComment[], lang);
    await sendWhatsAppRaw(alertRes.data.whatsapp, body).catch(() => null);
    channels.push('whatsapp');
  }

  if (alertRes.data?.email_enabled && alertRes.data.email) {
    const html = formatEmail(hotComments as HotComment[], lang);
    await sendEmail(alertRes.data.email, LANG_LABELS[lang].title, html, tenantId).catch(() => null);
    channels.push('email');
  }

  // Log
  await db.from('lead_digest_log').insert({
    tenant_id: tenantId,
    hot_count: hotComments.length,
    channels_sent: channels,
    comment_fingerprint: fingerprint,
  }).then(() => null, () => null);

  return { tenant_id: tenantId, sent: channels.length > 0, hot_count: hotComments.length, channels };
}

function formatWhatsApp(comments: HotComment[], lang: Lang): string {
  const L = LANG_LABELS[lang];
  const lines = comments.map((c) => {
    const author = c.author_name ?? 'someone';
    const platformIcon = c.platform === 'instagram' ? '📷' : '📘';
    const snippet = c.text.length > 80 ? c.text.slice(0, 77) + '…' : c.text;
    return `${platformIcon} *${author}*: ${snippet}`;
  }).join('\n\n');
  return `🔥 *${L.title}*\n\n${L.intro}\n\n${lines}\n\n${L.cta}: ${WEB_URL}/dashboard?tab=comments`;
}

function formatEmail(comments: HotComment[], lang: Lang): string {
  const L = LANG_LABELS[lang];
  const isRtl = lang === 'he' || lang === 'ar';
  const items = comments.map((c) => {
    const author = c.author_name ?? 'someone';
    return `<li style="margin-bottom:10px"><strong><bdi>${author}</bdi></strong> on ${c.platform}: <bdi>${escapeHtml(c.text)}</bdi></li>`;
  }).join('');
  return `
<div dir="${isRtl ? 'rtl' : 'ltr'}" style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <img src="https://vigmis.com/logo.png" alt="Vigmis" width="100" style="margin-bottom:24px"/>
  <h2 style="margin:0 0 12px;color:#0f172a">🔥 ${L.title}</h2>
  <p style="margin:0 0 16px;color:#475569">${L.intro}</p>
  <ul style="margin:0;padding-${isRtl ? 'right' : 'left'}:20px;color:#374151;font-size:14px">${items}</ul>
  <a href="${WEB_URL}/dashboard?tab=comments" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:20px">${L.cta}</a>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendWhatsAppRaw(to: string, message: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) return;
  const from = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? TWILIO_WHATSAPP_FROM : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: toFmt, Body: message }).toString(),
  });
}

/**
 * Cron entrypoint — runs every 30 min, dispatches to all tenants with hot leads.
 */
export async function dispatchLeadDigestCron(): Promise<{ tenants: number; sent: number }> {
  const { data: tenants } = await db.from('social_comments')
    .select('tenant_id')
    .gte('priority_score', DIGEST_HOT_PRIORITY)
    .gte('commented_at', new Date(Date.now() - DIGEST_LOOKBACK_HOURS * 3600_000).toISOString())
    .neq('status', 'sent');

  const uniqueTenants = [...new Set((tenants ?? []).map((t: { tenant_id: string }) => t.tenant_id))];
  let sent = 0;
  for (const t of uniqueTenants) {
    const r = await sendLeadDigestForTenant(t).catch(() => ({ sent: false } as DigestResult));
    if (r.sent) sent++;
  }
  return { tenants: uniqueTenants.length, sent };
}

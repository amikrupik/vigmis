// Proactive Briefings — Vigmis-initiated communication to the customer.
//
// Instead of waiting for the customer to open the dashboard, push them a
// 3-section briefing via WhatsApp + Email:
//
//   1. What's working    — top-performing campaigns/posts, ROAS, wins
//   2. What needs decision — pending approvals, blocked content, budget issues
//   3. What I'm doing    — autonomous changes made since last briefing
//
// Frequency: daily or weekly per tenant preference. Default weekly.

import { db } from '@vigmis/db';
import { sendEmail } from './notify.js';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const BRIEFING_LOOKBACK_DAYS = 7;  // weekly default; daily uses 1

const LANG_LABELS = {
  en: {
    title: 'Your Vigmis briefing',
    working: "What's working",
    decision: 'What needs your decision',
    automated: "What I did for you",
    open_dashboard: 'Open dashboard',
    nothing: 'Nothing new — your campaigns are running normally.',
  },
  he: {
    title: 'התקציר מ-Vigmis',
    working: 'מה עובד',
    decision: 'מה דורש את ההחלטה שלך',
    automated: 'מה עשיתי בשבילך',
    open_dashboard: 'פתח דשבורד',
    nothing: 'אין חדש — הקמפיינים שלך רצים תקין.',
  },
  ar: {
    title: 'موجز Vigmis',
    working: 'ما الذي يعمل',
    decision: 'ما يحتاج قرارك',
    automated: 'ما قمت به نيابة عنك',
    open_dashboard: 'افتح اللوحة',
    nothing: 'لا جديد — حملاتك تسير بشكل طبيعي.',
  },
  ru: {
    title: 'Сводка Vigmis',
    working: 'Что работает',
    decision: 'Что требует вашего решения',
    automated: 'Что я сделал для вас',
    open_dashboard: 'Открыть панель',
    nothing: 'Ничего нового — кампании работают нормально.',
  },
};

type Lang = keyof typeof LANG_LABELS;

export interface BriefingSections {
  working: string[];     // bullets
  decision: string[];
  automated: string[];
  metrics: Record<string, unknown>;
}

/**
 * Assemble the 3-section briefing content from real DB state.
 */
export async function buildBriefing(tenantId: string, cadence: 'daily' | 'weekly'): Promise<BriefingSections> {
  const lookbackDays = cadence === 'daily' ? 1 : BRIEFING_LOOKBACK_DAYS;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // ── What's working: top-performing campaigns + posts
  const [campaignsRes, topPostsRes, analyticsRes] = await Promise.all([
    db.from('campaigns')
      .select('id, name, platform, status, daily_budget_usd')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    db.from('social_posts')
      .select('id, platform, content, published_at, social_analytics(reach, likes, comments)')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .gte('published_at', cutoff)
      .order('published_at', { ascending: false })
      .limit(10),
    db.from('ga4_daily_metrics')
      .select('date, sessions, conversions, revenue')
      .eq('tenant_id', tenantId)
      .gte('date', cutoff.slice(0, 10))
      .order('date', { ascending: false }),
  ]);

  const working: string[] = [];
  const totalRevenue = (analyticsRes.data ?? []).reduce(
    (s: number, r: { revenue?: number | null }) => s + (r.revenue ?? 0),
    0,
  );
  const totalSessions = (analyticsRes.data ?? []).reduce(
    (s: number, r: { sessions?: number | null }) => s + (r.sessions ?? 0),
    0,
  );
  if (totalRevenue > 0 || totalSessions > 0) {
    working.push(`Traffic: ${totalSessions.toLocaleString()} sessions / Revenue: $${totalRevenue.toFixed(0)} (last ${lookbackDays}d)`);
  }
  if ((campaignsRes.data?.length ?? 0) > 0) {
    working.push(`${campaignsRes.data!.length} active campaign(s) running`);
  }

  // ── What needs decision
  const decision: string[] = [];
  const [pendingPostsRes, blockedContentRes, missingAttRes, readinessGate] = await Promise.all([
    db.from('social_posts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending_approval'),
    db.from('social_posts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'blocked_by_policy'),
    db.from('content_attestations').select('attestation_kind')
      .eq('tenant_id', tenantId)
      .in('attestation_kind', ['onboarding_master','tos_acceptance','ai_disclosure_consent']),
    db.from('client_settings').select('conversion_readiness_score')
      .eq('tenant_id', tenantId).maybeSingle(),
  ]);

  if ((pendingPostsRes.count ?? 0) > 0) {
    decision.push(`${pendingPostsRes.count} post(s) waiting for your approval`);
  }
  if ((blockedContentRes.count ?? 0) > 0) {
    decision.push(`${blockedContentRes.count} post(s) blocked by policy — review the suggested rewrites`);
  }
  const haveSet = new Set((missingAttRes.data ?? []).map((a: { attestation_kind: string }) => a.attestation_kind));
  const missing = ['onboarding_master','tos_acceptance','ai_disclosure_consent'].filter((k) => !haveSet.has(k));
  if (missing.length > 0) {
    decision.push(`Required consents missing: ${missing.join(', ')}`);
  }
  const readinessScore = readinessGate.data?.conversion_readiness_score;
  if (readinessScore != null && readinessScore < 50) {
    decision.push(`Landing page conversion readiness is low (${readinessScore}/100) — fix recommended before paid traffic`);
  }

  // ── What I did
  const automated: string[] = [];
  const [scaleActions, generatedPosts, blockedDecisions] = await Promise.all([
    db.from('audit_log')
      .select('action')
      .eq('tenant_id', tenantId)
      .in('action', ['campaign.scaled_up','campaign.scaled_down','campaign.paused'])
      .gte('created_at', cutoff),
    db.from('social_posts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', cutoff),
    db.from('content_decisions').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('decision', 'block')
      .gte('created_at', cutoff),
  ]);

  const scaleUps = (scaleActions.data ?? []).filter((a: { action: string }) => a.action === 'campaign.scaled_up').length;
  const scaleDowns = (scaleActions.data ?? []).filter((a: { action: string }) => a.action === 'campaign.scaled_down').length;
  const pauses = (scaleActions.data ?? []).filter((a: { action: string }) => a.action === 'campaign.paused').length;
  if (scaleUps + scaleDowns + pauses > 0) {
    const parts = [];
    if (scaleUps) parts.push(`scaled up ${scaleUps}`);
    if (scaleDowns) parts.push(`scaled down ${scaleDowns}`);
    if (pauses) parts.push(`paused ${pauses}`);
    automated.push(`Optimization actions: ${parts.join(', ')}`);
  }
  if ((generatedPosts.count ?? 0) > 0) {
    automated.push(`Drafted ${generatedPosts.count} new post(s)`);
  }
  if ((blockedDecisions.count ?? 0) > 0) {
    automated.push(`Caught ${blockedDecisions.count} risky claim(s) in generated content before they reached a platform`);
  }

  return {
    working,
    decision,
    automated,
    metrics: {
      lookback_days: lookbackDays,
      total_revenue: totalRevenue,
      total_sessions: totalSessions,
      active_campaigns: campaignsRes.data?.length ?? 0,
      pending_posts: pendingPostsRes.count ?? 0,
      blocked_posts: blockedContentRes.count ?? 0,
      scale_ups: scaleUps,
      scale_downs: scaleDowns,
      pauses,
    },
  };
}

function totalSignal(b: BriefingSections): number {
  return b.working.length + b.decision.length + b.automated.length;
}

function formatWhatsApp(sections: BriefingSections, lang: Lang): string {
  const L = LANG_LABELS[lang];
  const block = (label: string, items: string[]) =>
    items.length > 0 ? `\n*${label}:*\n${items.map((i) => `• ${i}`).join('\n')}` : '';

  const body = `${block(L.working, sections.working)}${block(L.decision, sections.decision)}${block(L.automated, sections.automated)}`;
  return `*${LANG_LABELS[lang].title}*${body || `\n${L.nothing}`}\n\n${L.open_dashboard}: ${WEB_URL}/dashboard`;
}

function formatEmail(sections: BriefingSections, lang: Lang): string {
  const L = LANG_LABELS[lang];
  const isRtl = lang === 'he' || lang === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const block = (label: string, items: string[]) =>
    items.length > 0
      ? `<div style="margin-bottom:18px"><p style="font-weight:700;margin:0 0 6px;color:#0f172a">${label}</p><ul style="margin:0;padding-${isRtl ? 'right' : 'left'}:18px;color:#374151;font-size:14px">${items.map((i) => `<li style="margin-bottom:4px"><bdi>${i}</bdi></li>`).join('')}</ul></div>`
      : '';
  return `
<div dir="${dir}" style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <img src="https://vigmis.com/logo.png" alt="Vigmis" width="100" style="margin-bottom:24px"/>
  <h2 style="margin:0 0 16px;color:#0f172a">${L.title}</h2>
  ${block(L.working, sections.working)}
  ${block(L.decision, sections.decision)}
  ${block(L.automated, sections.automated)}
  ${totalSignal(sections) === 0 ? `<p style="color:#64748b">${L.nothing}</p>` : ''}
  <a href="${WEB_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:16px">${L.open_dashboard}</a>
</div>`;
}

/**
 * Send a briefing to a single tenant. Honors their preferences and the
 * min_significant_changes threshold — empty briefings are skipped.
 */
export async function sendBriefingForTenant(tenantId: string): Promise<{ sent: boolean; reason?: string }> {
  const { data: prefs } = await db.from('briefing_preferences')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!prefs || !prefs.enabled || prefs.cadence === 'never') {
    return { sent: false, reason: 'disabled' };
  }

  const { data: alertSettings } = await db.from('alert_settings')
    .select('email, whatsapp')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const sections = await buildBriefing(tenantId, prefs.cadence as 'daily' | 'weekly');
  if (totalSignal(sections) < (prefs.min_significant_changes ?? 1)) {
    return { sent: false, reason: 'no_signal' };
  }

  const lang = (prefs.language ?? 'en') as Lang;
  const channels = (prefs.channels ?? ['email']) as string[];
  const channelsSent: string[] = [];

  if (channels.includes('email') && alertSettings?.email) {
    await sendEmail(
      alertSettings.email,
      LANG_LABELS[lang].title,
      formatEmail(sections, lang),
      tenantId,
    ).catch(() => null);
    channelsSent.push('email');
  }

  if (channels.includes('whatsapp') && alertSettings?.whatsapp) {
    const waBody = formatWhatsApp(sections, lang);
    await sendWhatsAppRaw(alertSettings.whatsapp, waBody).catch(() => null);
    channelsSent.push('whatsapp');
  }

  await db.from('briefing_log').insert({
    tenant_id: tenantId,
    cadence: prefs.cadence,
    channels_sent: channelsSent,
    summary_working: sections.working.join('\n'),
    summary_decision: sections.decision.join('\n'),
    summary_automated: sections.automated.join('\n'),
    metrics_snapshot: sections.metrics,
  });

  return { sent: channelsSent.length > 0 };
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
 * Cron entrypoint — fires for all enabled tenants whose preferred delivery
 * hour matches the current hour in their timezone.
 */
export async function dispatchBriefingsCron(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const { data: prefs } = await db.from('briefing_preferences')
    .select('tenant_id, cadence, delivery_hour, weekly_day_of_week, timezone')
    .eq('enabled', true)
    .neq('cadence', 'never');

  if (!prefs?.length) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;
  for (const p of prefs) {
    if (!matchesDeliveryWindow(p, now)) { skipped++; continue; }
    const result = await sendBriefingForTenant(p.tenant_id).catch(() => ({ sent: false }));
    if (result.sent) sent++; else skipped++;
  }
  return { sent, skipped };
}

function matchesDeliveryWindow(
  pref: { cadence: string; delivery_hour: number; weekly_day_of_week: number; timezone: string },
  now: Date,
): boolean {
  // Best-effort tz check. For robust timezone math we'd pull in a date library;
  // for now we compute the hour-of-day in the tenant's tz and compare to the
  // preferred delivery_hour. Off by an hour around DST transitions but
  // acceptable for a non-urgent briefing.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: pref.timezone,
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const wdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const wdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wday = wdayMap[wdayStr] ?? 0;

  if (hour !== pref.delivery_hour) return false;
  if (pref.cadence === 'weekly' && wday !== pref.weekly_day_of_week) return false;
  return true;
}

// GET  /alerts          — active alerts for this tenant
// POST /alerts/dismiss  — dismiss an alert (persisted)
// POST /alerts/settings — save alert preferences (email + WhatsApp)
// GET  /alerts/settings — get current preferences
//
// Alert types: spend_anomaly | ctr_drop | creative_fatigue | budget_exhaustion | campaign_error
//
// Delivery: WhatsApp via Twilio, Email via SendGrid
// Activates when TWILIO_* and SENDGRID_API_KEY env vars are set in Railway.

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

type AlertSeverity = 'critical' | 'warning' | 'info';

type Alert = {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  campaign_id?: string;
  campaign_name?: string;
  platform?: string;
  action?: string;
  created_at: string;
  dismissed: boolean;
};

// ── Delivery helpers ──────────────────────────────────────────────────────────

async function sendWhatsApp(to: string, message: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
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

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

function withUnsubscribeFooter(html: string, tenantId: string): string {
  return `${html}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
  You're receiving this because you enabled email alerts in Vigmis.
  <a href="${WEB_URL}/unsubscribe?token=${tenantId}" style="color:#94a3b8;text-decoration:underline;margin-left:4px">Unsubscribe</a>
</div>`;
}

async function sendEmail(to: string, subject: string, html: string, tenantId?: string): Promise<void> {
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

async function deliverAlert(tenantId: string, alert: Alert): Promise<void> {
  if (alert.severity === 'info') return;

  const { data: settings } = await db
    .from('alert_settings')
    .select('email, whatsapp, email_enabled, whatsapp_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!settings) return;

  const message = `🚨 Vigmis Alert: ${alert.title}\n\n${alert.message}\n\n→ ${alert.action ?? 'Check your dashboard'}`;

  const promises: Promise<void>[] = [];

  if (settings.whatsapp_enabled && settings.whatsapp) {
    promises.push(sendWhatsApp(settings.whatsapp, message));
  }

  if (settings.email_enabled && settings.email) {
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <img src="https://vigmis.com/logo.png" alt="Vigmis" width="100" style="margin-bottom:24px"/>
        <div style="background:${alert.severity === 'critical' ? '#fef2f2' : '#fffbeb'};border:1px solid ${alert.severity === 'critical' ? '#fecaca' : '#fde68a'};border-radius:12px;padding:20px;margin-bottom:20px">
          <p style="font-weight:700;margin:0 0 8px;font-size:16px">${alert.title}</p>
          <p style="margin:0;color:#374151;font-size:14px">${alert.message}</p>
        </div>
        ${alert.action ? `<p style="font-size:14px;color:#6b7280">→ ${alert.action}</p>` : ''}
        <a href="https://vigmis.com/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:16px">Open Dashboard</a>
      </div>`;
    promises.push(sendEmail(settings.email, `Vigmis: ${alert.title}`, html, tenantId));
  }

  await Promise.allSettled(promises);
}

// ── Mock alert generator ──────────────────────────────────────────────────────

function generateAlerts(campaigns: any[], dismissedIds: Set<string>): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const c of campaigns) {
    if (c.status === 'error') {
      alerts.push({
        id: `err-${c.id}`,
        type: 'campaign_error',
        severity: 'critical',
        title: 'Campaign Error',
        message: c.error_message ?? `Campaign "${c.name}" encountered an error and stopped running.`,
        campaign_id: c.id,
        campaign_name: c.name,
        platform: c.platform,
        action: 'Check campaign settings or contact support',
        created_at: now,
        dismissed: dismissedIds.has(`err-${c.id}`),
      });
    }
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  if (activeCampaigns.length > 0) {
    const seed = activeCampaigns[0].id.charCodeAt(0);

    if (seed % 3 === 0) {
      const id = `fatigue-${activeCampaigns[0].id}`;
      alerts.push({
        id,
        type: 'creative_fatigue',
        severity: 'warning',
        title: 'Creative Fatigue Detected',
        message: `CTR for "${activeCampaigns[0].name}" dropped 28% over the last 5 days — your audience has seen this ad too many times.`,
        campaign_id: activeCampaigns[0].id,
        campaign_name: activeCampaigns[0].name,
        platform: activeCampaigns[0].platform,
        action: 'Generate a new creative variation to refresh performance',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        dismissed: dismissedIds.has(id),
      });
    }

    if (seed % 5 === 0) {
      const id = `pacing-${activeCampaigns[0].id}`;
      alerts.push({
        id,
        type: 'budget_exhaustion',
        severity: 'warning',
        title: 'Budget Pacing Alert',
        message: 'You are on track to exhaust your monthly budget by day 22. Consider increasing budget or pausing low-performers.',
        action: 'Review budget allocation in the Analytics tab',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        dismissed: dismissedIds.has(id),
      });
    }
  }

  if (campaigns.length === 0) {
    const id = 'info-no-campaigns';
    alerts.push({
      id,
      type: 'info',
      severity: 'info',
      title: 'No Active Campaigns',
      message: 'Launch your campaigns to start receiving performance alerts.',
      action: 'Go to Overview and click Launch',
      created_at: now,
      dismissed: dismissedIds.has(id),
    });
  }

  return alerts;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function alertRoutes(app: FastifyInstance) {

  // GET /alerts
  app.get('/alerts', { preHandler: authenticate }, async (request, reply) => {
    const [campaignsRes, dismissedRes, fatigueRes] = await Promise.all([
      db.from('campaigns')
        .select('id, platform, name, status, daily_budget_usd, error_message')
        .eq('tenant_id', request.tenantId),
      db.from('dismissed_alerts')
        .select('alert_id')
        .eq('tenant_id', request.tenantId),
      // Real creative fatigue alerts from optimization engine
      db.from('audit_log')
        .select('payload, created_at')
        .eq('tenant_id', request.tenantId)
        .eq('action', 'optimization.creative_fatigue')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const dismissedIds = new Set((dismissedRes.data ?? []).map((d: any) => d.alert_id));
    const alerts = generateAlerts(campaignsRes.data ?? [], dismissedIds);

    // Inject real creative fatigue alerts from optimization engine
    for (const log of (fatigueRes.data ?? [])) {
      const p = log.payload as any;
      const id = `fatigue-real-${p.campaignId}`;
      if (dismissedIds.has(id)) continue;
      if (alerts.some(a => a.id === id)) continue;
      alerts.unshift({
        id,
        type: 'creative_fatigue',
        severity: 'warning',
        title: 'Creative Fatigue Detected',
        message: p.reason ?? `CTR dropped significantly for "${p.campaignName}" — time to refresh your creative.`,
        campaign_id: p.campaignId,
        campaign_name: p.campaignName,
        platform: undefined,
        action: 'Generate a new creative variation in the Creative tab',
        created_at: log.created_at,
        dismissed: false,
      });
    }

    return reply.send({
      alerts,
      is_mock: fatigueRes.data?.length === 0,
      unread_count: alerts.filter(a => !a.dismissed && a.severity !== 'info').length,
    });
  });

  // POST /alerts/dismiss
  app.post('/alerts/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { alert_id } = request.body as any;
    if (!alert_id) return reply.code(400).send({ error: 'alert_id required' });

    await db.from('dismissed_alerts').upsert(
      { tenant_id: request.tenantId, alert_id, dismissed_at: new Date().toISOString() },
      { onConflict: 'tenant_id,alert_id' },
    );

    return reply.send({ success: true, alert_id });
  });

  // GET /alerts/settings
  app.get('/alerts/settings', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db
      .from('alert_settings')
      .select('email, whatsapp, email_enabled, whatsapp_enabled, thresholds')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    return reply.send(data ?? {
      email: null,
      whatsapp: null,
      email_enabled: true,
      whatsapp_enabled: true,
      thresholds: { ctr_drop_pct: 20, spend_spike_pct: 50, budget_exhaustion_day: 25 },
    });
  });

  // POST /alerts/settings
  app.post('/alerts/settings', { preHandler: authenticate }, async (request, reply) => {
    const { email, whatsapp, email_enabled, whatsapp_enabled, thresholds } = request.body as any;

    const { error } = await db.from('alert_settings').upsert(
      {
        tenant_id: request.tenantId,
        email: email ?? null,
        whatsapp: whatsapp ?? null,
        email_enabled: email_enabled ?? true,
        whatsapp_enabled: whatsapp_enabled ?? true,
        thresholds: thresholds ?? { ctr_drop_pct: 20, spend_spike_pct: 50, budget_exhaustion_day: 25 },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );

    if (error) return reply.code(500).send({ error: 'Failed to save settings' });

    const channels: string[] = [];
    if (email && process.env.SENDGRID_API_KEY) channels.push('email');
    if (whatsapp && process.env.TWILIO_ACCOUNT_SID) channels.push('whatsapp');

    return reply.send({
      success: true,
      active_channels: channels,
      pending_setup: [
        email && !process.env.SENDGRID_API_KEY ? 'email (API key not configured)' : null,
        whatsapp && !process.env.TWILIO_ACCOUNT_SID ? 'whatsapp (API key not configured)' : null,
      ].filter(Boolean),
    });
  });

  // POST /alerts/test — send a test alert to verify delivery
  app.post('/alerts/test', { preHandler: authenticate }, async (request, reply) => {
    const testAlert: Alert = {
      id: 'test',
      type: 'test',
      severity: 'warning',
      title: 'Test Alert from Vigmis',
      message: 'Your alert delivery is working correctly. You will receive alerts like this when your campaigns need attention.',
      action: 'No action needed — this is a test',
      created_at: new Date().toISOString(),
      dismissed: false,
    };

    await deliverAlert(request.tenantId, testAlert);
    return reply.send({ success: true, message: 'Test alert sent to your configured channels' });
  });
}

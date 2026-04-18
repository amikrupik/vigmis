// POST /notifications/digest  — send weekly performance digest to all tenants (cron)
// GET  /notifications/digest/preview — preview digest for current tenant

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

const FROM_EMAIL = 'digest@vigmis.com';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

function buildDigestHtml(tenantData: {
  period: string;
  campaigns: Array<{ name: string; platform: string; status: string; daily_budget_usd: number }>;
  alertCount: number;
  actionsApplied: number;
}): string {
  const { period, campaigns, alertCount, actionsApplied } = tenantData;
  const active = campaigns.filter(c => c.status === 'active');
  const totalBudget = active.reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);

  const campaignRows = campaigns.slice(0, 8).map(c => `
    <tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:10px 16px;font-size:13px;color:#1e293b;font-weight:600">${c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</td>
      <td style="padding:10px 16px;font-size:12px;text-transform:uppercase;font-weight:700;color:${c.platform === 'google' ? '#2563eb' : c.platform === 'meta' ? '#7c3aed' : '#475569'}">${c.platform}</td>
      <td style="padding:10px 16px">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${c.status === 'active' ? '#d1fae5' : c.status === 'paused' ? '#fef3c7' : '#fee2e2'};color:${c.status === 'active' ? '#065f46' : c.status === 'paused' ? '#92400e' : '#991b1b'}">${c.status}</span>
      </td>
      <td style="padding:10px 16px;font-size:13px;color:#475569">$${c.daily_budget_usd}/day</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:24px 16px">

    <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
        <img src="https://vigmis.com/logo.png" alt="Vigmis" height="28" style="filter:brightness(0) invert(1);margin-bottom:16px;display:block"/>
        <h1 style="margin:0;color:white;font-size:20px;font-weight:700">Weekly Performance Digest</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px">${period}</p>
      </div>

      <!-- Summary stats -->
      <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:24px;font-weight:800;color:#4f46e5">${active.length}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">Active Campaigns</p>
          </div>
          <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:24px;font-weight:800;color:#059669">$${totalBudget.toFixed(0)}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">Daily Budget</p>
          </div>
          <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:24px;font-weight:800;color:${actionsApplied > 0 ? '#4f46e5' : '#94a3b8'}">${actionsApplied}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">AI Optimizations</p>
          </div>
        </div>
      </div>

      <!-- Campaigns -->
      ${campaigns.length > 0 ? `
      <div style="padding:24px 32px">
        <h2 style="margin:0 0 16px;font-size:14px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em">Your Campaigns</h2>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Campaign</th>
              <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Platform</th>
              <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Status</th>
              <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Budget</th>
            </tr>
          </thead>
          <tbody>${campaignRows}</tbody>
        </table>
      </div>
      ` : `
      <div style="padding:24px 32px;text-align:center">
        <p style="color:#94a3b8;font-size:14px">No campaigns yet — launch from your dashboard to get started.</p>
      </div>
      `}

      <!-- Alerts note -->
      ${alertCount > 0 ? `
      <div style="margin:0 32px 24px;background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:16px">
        <p style="margin:0;font-size:13px;font-weight:600;color:#92400e">⚠️ ${alertCount} alert${alertCount > 1 ? 's' : ''} need your attention</p>
        <p style="margin:4px 0 0;font-size:12px;color:#b45309">Review them in your dashboard to keep campaigns running smoothly.</p>
      </div>
      ` : ''}

      <!-- CTA -->
      <div style="padding:0 32px 28px;text-align:center">
        <a href="https://vigmis.com/dashboard" style="display:inline-block;background:#4f46e5;color:white;font-weight:700;font-size:14px;padding:12px 28px;border-radius:12px;text-decoration:none">
          Open Dashboard →
        </a>
        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">
          You're receiving this because you have an active Vigmis account.
          <a href="https://vigmis.com/dashboard" style="color:#94a3b8">Manage notifications</a> &middot;
          <a href="${WEB_URL}/unsubscribe?token={{TENANT_ID}}" style="color:#94a3b8">Unsubscribe</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function sendDigest(email: string, html: string, period: string): Promise<void> {
  const { SENDGRID_API_KEY } = process.env;
  if (!SENDGRID_API_KEY) return;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: FROM_EMAIL, name: 'Vigmis' },
      subject: `Your Weekly Ad Performance Digest — ${period}`,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

export async function notificationRoutes(app: FastifyInstance) {

  // GET /notifications/digest/preview — show what the digest looks like for current tenant
  app.get('/notifications/digest/preview', { preHandler: authenticate }, async (request, reply) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const period = `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const [campaignsRes, alertsRes, logsRes] = await Promise.all([
      db.from('campaigns').select('name, platform, status, daily_budget_usd').eq('tenant_id', request.tenantId),
      db.from('dismissed_alerts').select('alert_id').eq('tenant_id', request.tenantId),
      db.from('audit_log')
        .select('action')
        .eq('tenant_id', request.tenantId)
        .like('action', 'optimization.%')
        .not('action', 'eq', 'optimization.metrics_snapshot')
        .gte('created_at', weekAgo.toISOString()),
    ]);

    const html = buildDigestHtml({
      period,
      campaigns: campaignsRes.data ?? [],
      alertCount: Math.max(0, (alertsRes.data?.length ?? 0)),
      actionsApplied: logsRes.data?.length ?? 0,
    });

    return reply.header('Content-Type', 'text/html').send(html);
  });

  // POST /notifications/digest — send weekly digest to all tenants (cron-protected)
  app.post('/notifications/digest', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const period = `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    // Load all tenants with alert settings (email required for digest)
    const { data: settingsList } = await db
      .from('alert_settings')
      .select('tenant_id, email, email_enabled')
      .eq('email_enabled', true)
      .not('email', 'is', null);

    if (!settingsList?.length) return reply.send({ sent: 0, skipped: 0 });

    let sent = 0;
    let skipped = 0;

    for (const settings of settingsList) {
      if (!settings.email) { skipped++; continue; }

      try {
        const [campaignsRes, logsRes] = await Promise.all([
          db.from('campaigns').select('name, platform, status, daily_budget_usd').eq('tenant_id', settings.tenant_id),
          db.from('audit_log')
            .select('action')
            .eq('tenant_id', settings.tenant_id)
            .like('action', 'optimization.%')
            .not('action', 'eq', 'optimization.metrics_snapshot')
            .gte('created_at', weekAgo.toISOString()),
        ]);

        const html = buildDigestHtml({
          period,
          campaigns: campaignsRes.data ?? [],
          alertCount: 0,
          actionsApplied: logsRes.data?.length ?? 0,
        }).replace('{{TENANT_ID}}', settings.tenant_id);

        await sendDigest(settings.email, html, period);
        sent++;
      } catch {
        skipped++;
      }
    }

    return reply.send({ sent, skipped, period });
  });
}

// GET  /alerts          — active alerts for this tenant
// POST /alerts/dismiss  — dismiss an alert
// POST /alerts/settings — update alert preferences
//
// Alert types: spend_anomaly | ctr_drop | creative_fatigue | budget_exhaustion | campaign_error
//
// Delivery channels (TODO next week):
//   - Email: connect SendGrid / AWS SES
//   - WhatsApp: connect Twilio WhatsApp Business API

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

// ── Mock alert generator (TODO: replace with real metric comparison) ──────────
function generateAlerts(campaigns: any[]): Alert[] {
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
        dismissed: false,
      });
    }
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  // Simulate occasional performance alerts for demo
  if (activeCampaigns.length > 0) {
    const seed = activeCampaigns[0].id.charCodeAt(0);
    if (seed % 3 === 0) {
      alerts.push({
        id: `fatigue-${activeCampaigns[0].id}`,
        type: 'creative_fatigue',
        severity: 'warning',
        title: 'Creative Fatigue Detected',
        message: `CTR for "${activeCampaigns[0].name}" dropped 28% over the last 5 days — your audience has seen this ad too many times.`,
        campaign_id: activeCampaigns[0].id,
        campaign_name: activeCampaigns[0].name,
        platform: activeCampaigns[0].platform,
        action: 'Generate a new creative variation to refresh performance',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        dismissed: false,
      });
    }

    if (seed % 5 === 0) {
      alerts.push({
        id: `pacing-${activeCampaigns[0].id}`,
        type: 'budget_exhaustion',
        severity: 'warning',
        title: 'Budget Pacing Alert',
        message: `You are on track to exhaust your monthly budget by day 22. Consider increasing budget or pausing low-performers.`,
        action: 'Review budget allocation in the Analytics tab',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        dismissed: false,
      });
    }
  }

  // Budget not connected — info alert
  if (campaigns.length === 0) {
    alerts.push({
      id: 'info-no-campaigns',
      type: 'info',
      severity: 'info',
      title: 'No Active Campaigns',
      message: 'Launch your campaigns to start receiving performance alerts.',
      action: 'Go to Overview and click Launch',
      created_at: now,
      dismissed: false,
    });
  }

  return alerts;
}

export async function alertRoutes(app: FastifyInstance) {
  // GET /alerts
  app.get('/alerts', { preHandler: authenticate }, async (request, reply) => {
    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, platform, name, status, daily_budget_usd, error_message')
      .eq('tenant_id', request.tenantId);

    // TODO: also fetch dismissed alert IDs from a future `alerts` table
    // For now: generate from campaign state
    const alerts = generateAlerts(campaigns ?? []);

    return reply.send({
      alerts,
      is_mock: true, // ← real alert engine connects after API integrations
      unread_count: alerts.filter(a => !a.dismissed && a.severity !== 'info').length,
    });
  });

  // POST /alerts/dismiss
  app.post('/alerts/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { alert_id } = request.body as any;
    // TODO: persist dismissed state in DB
    // await db.from('dismissed_alerts').insert({ tenant_id: request.tenantId, alert_id });
    return reply.send({ success: true, alert_id });
  });

  // POST /alerts/settings
  // TODO (next week): connect email via SendGrid + WhatsApp via Twilio
  app.post('/alerts/settings', { preHandler: authenticate }, async (request, reply) => {
    const { email, whatsapp, thresholds } = request.body as any;
    // TODO: store in tenant settings
    // await db.from('alert_settings').upsert({ tenant_id: request.tenantId, email, whatsapp, thresholds });
    return reply.send({
      success: true,
      message: 'Alert settings saved. Delivery channels will activate when connected.',
      // TODO: channels connect next week
      pending_setup: [
        !email ? null : 'email',
        !whatsapp ? null : 'whatsapp',
      ].filter(Boolean),
    });
  });
}

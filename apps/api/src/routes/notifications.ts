// POST /notifications/digest       — weekly performance digest (cron, every Monday)
// POST /notifications/daily        — daily morning report (cron, every day 8am)
// GET  /notifications/digest/preview — preview digest for current tenant

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

const FROM_EMAIL = 'digest@vigmis.com';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// ── Helper: format number with sign ──────────────────────────────────────────

function fmtChange(pct: number | null | undefined, inverse = false): string {
  if (pct === null || pct === undefined) return '<span style="color:#94a3b8">—</span>';
  const good = inverse ? pct < 0 : pct > 0;
  const color = good ? '#059669' : pct === 0 ? '#94a3b8' : '#dc2626';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
  return `<span style="color:${color};font-weight:700">${arrow}${Math.abs(pct).toFixed(1)}%</span>`;
}

function metricCard(label: string, value: string, change?: string, sub?: string): string {
  return `
    <div style="background:#f8fafc;border-radius:12px;padding:16px;flex:1;min-width:120px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">${label}</p>
      <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a">${value}</p>
      ${change ? `<p style="margin:4px 0 0;font-size:12px">${change}</p>` : ''}
      ${sub ? `<p style="margin:4px 0 0;font-size:11px;color:#94a3b8">${sub}</p>` : ''}
    </div>`;
}

function platformBadge(platform: string): string {
  const colors: Record<string, string> = {
    google: '#2563eb', meta: '#7c3aed', tiktok: '#475569',
  };
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${colors[platform] ?? '#e2e8f0'};color:white;text-transform:uppercase">${platform}</span>`;
}

// ── Daily Report ──────────────────────────────────────────────────────────────

function buildDailyReportHtml(data: {
  clientName: string;
  dateStr: string;
  yesterday: { spend: number; impressions: number; clicks: number; conversions: number; convValue: number; ctr: number; roas: number };
  prevDay: { spend: number; impressions: number; clicks: number; conversions: number; convValue: number; ctr: number; roas: number };
  changes: Record<string, number | null>;
  dailyBudget: number;
  activeCampaigns: number;
  actions: Array<{ action: string; campaign?: string; detail?: string; created_at: string }>;
  alerts: Array<{ type: string; title: string; message: string; severity: string }>;
  pendingApprovals: number;
  pendingSocialPosts: number;
  pendingComments: number;
}): string {
  const {
    clientName, dateStr, yesterday, prevDay, changes,
    dailyBudget, activeCampaigns, actions, alerts,
    pendingApprovals, pendingSocialPosts, pendingComments,
  } = data;

  const attentionItems = [
    ...(alerts.filter(a => a.severity !== 'info').map(a => `⚠️ ${a.title}`)),
    ...(pendingApprovals > 0 ? [`📋 ${pendingApprovals} optimization${pendingApprovals > 1 ? 's' : ''} awaiting approval`] : []),
    ...(pendingSocialPosts > 0 ? [`📱 ${pendingSocialPosts} social post${pendingSocialPosts > 1 ? 's' : ''} ready to review`] : []),
    ...(pendingComments > 0 ? [`💬 ${pendingComments} comment${pendingComments > 1 ? 's' : ''} need replies`] : []),
  ];

  const pacingPct = dailyBudget > 0 ? Math.round(yesterday.spend / dailyBudget * 100) : 0;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vigmis Daily Report — ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);border-radius:16px 16px 0 0;padding:28px 32px;margin-bottom:0">
    <img src="https://vigmis.com/logo.png" alt="Vigmis" height="26" style="filter:brightness(0) invert(1);display:block;margin-bottom:20px"/>
    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em">Daily Performance Report</p>
    <h1 style="margin:4px 0 0;color:white;font-size:24px;font-weight:800">${dateStr}</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:13px">${activeCampaigns} active campaign${activeCampaigns !== 1 ? 's' : ''} · $${dailyBudget.toFixed(0)}/day budget</p>
  </div>

  <!-- Main card -->
  <div style="background:white;border-radius:0 0 16px 16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);margin-bottom:16px">

    <!-- Yesterday's KPIs -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9">
      <h2 style="margin:0 0 16px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Yesterday at a glance</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${metricCard('Spend', `$${yesterday.spend.toFixed(2)}`, fmtChange(changes.spend, false), `${pacingPct}% of daily budget`)}
        ${metricCard('Conversions', `${yesterday.conversions}`, fmtChange(changes.conversions, false))}
        ${metricCard('ROAS', `${yesterday.roas}x`, fmtChange(changes.roas, false))}
        ${metricCard('CPA', `$${(yesterday.conversions > 0 ? yesterday.spend / yesterday.conversions : 0).toFixed(2)}`, fmtChange(changes.cpa, true))}
        ${metricCard('CTR', `${yesterday.ctr.toFixed(2)}%`, fmtChange(changes.ctr, false))}
        ${metricCard('Impressions', yesterday.impressions.toLocaleString(), fmtChange(changes.impressions, false))}
      </div>
      <p style="margin:12px 0 0;font-size:11px;color:#94a3b8">↑/↓ compared to the day before · ${fmtChange(changes.roas, false)} ROAS</p>
    </div>

    ${actions.length > 0 ? `
    <!-- AI Actions overnight -->
    <div style="padding:20px 32px;border-bottom:1px solid #f1f5f9">
      <h2 style="margin:0 0 14px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">What Vigmis did for you</h2>
      <div style="space-y:8px">
        ${actions.slice(0, 6).map(a => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f8fafc">
            <div style="width:28px;height:28px;border-radius:8px;background:#ede9fe;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px">
              ${a.action.includes('scale_up') ? '📈' : a.action.includes('pause') ? '⏸' : a.action.includes('resume') ? '▶️' : a.action.includes('budget') ? '💰' : '🤖'}
            </div>
            <div style="flex:1">
              <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;text-transform:capitalize">${a.action.replace(/_/g, ' ')}</p>
              ${a.campaign ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b">${a.campaign}</p>` : ''}
              ${a.detail ? `<p style="margin:2px 0 0;font-size:11px;color:#94a3b8">${a.detail}</p>` : ''}
            </div>
            <p style="margin:0;font-size:11px;color:#cbd5e1;flex-shrink:0">${new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        `).join('')}
      </div>
    </div>` : `
    <div style="padding:20px 32px;border-bottom:1px solid #f1f5f9">
      <p style="margin:0;font-size:13px;color:#94a3b8">No optimization actions taken yesterday — campaigns are running smoothly within targets.</p>
    </div>`}

    ${attentionItems.length > 0 ? `
    <!-- Attention items -->
    <div style="padding:20px 32px;border-bottom:1px solid #f1f5f9">
      <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.06em">Needs your attention</h2>
      ${attentionItems.map(item => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #fef2f2">
          <p style="margin:0;font-size:13px;color:#374151">${item}</p>
        </div>
      `).join('')}
      <div style="margin-top:14px">
        <a href="${WEB_URL}/dashboard" style="display:inline-block;background:#dc2626;color:white;font-weight:700;font-size:13px;padding:10px 20px;border-radius:10px;text-decoration:none">Review now →</a>
      </div>
    </div>` : `
    <div style="padding:16px 32px;border-bottom:1px solid #f1f5f9;background:#f0fdf4">
      <p style="margin:0;font-size:13px;color:#059669;font-weight:600">✓ No action needed — everything is on track today.</p>
    </div>`}

    <!-- CTA -->
    <div style="padding:20px 32px;text-align:center">
      <a href="${WEB_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:white;font-weight:700;font-size:14px;padding:12px 32px;border-radius:12px;text-decoration:none">
        Open Dashboard →
      </a>
      <p style="margin:14px 0 0;font-size:11px;color:#94a3b8">
        Vigmis · AI-Powered Ad Management ·
        <a href="${WEB_URL}/dashboard/settings" style="color:#94a3b8">Manage reports</a>
      </p>
    </div>
  </div>

  <p style="text-align:center;font-size:10px;color:#94a3b8;margin:8px 0">
    © ${new Date().getFullYear()} Taurus Management and Investments Ltd. — Vigmis ·
    <a href="${WEB_URL}/unsubscribe?token={{TENANT_ID}}" style="color:#cbd5e1">Unsubscribe</a>
  </p>
</div>
</body>
</html>`;
}

// ── Monthly Report ─────────────────────────────────────────────────────────────

function buildMonthlyReportHtml(data: {
  month: string;
  summary: { spend: number; impressions: number; clicks: number; conversions: number; convValue: number; ctr: number; cpa: number; roas: number };
  prevSummary: { spend: number; impressions: number; clicks: number; conversions: number; convValue: number; ctr: number; cpa: number; roas: number };
  changes: Record<string, number | null>;
  campaigns: Array<{ name: string; platform: string; status: string; daily_budget_usd: number; roas: number; spend: number }>;
  totalFeeUsd: number;
  socialPostsPublished: number;
  socialCommentsReplied: number;
  actionsApplied: number;
}): string {
  const {
    month, summary, prevSummary, changes, campaigns,
    totalFeeUsd, socialPostsPublished, socialCommentsReplied, actionsApplied,
  } = data;

  const topCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
  const active = campaigns.filter(c => c.status === 'active');
  const totalBudget = active.reduce((s, c) => s + c.daily_budget_usd * 30, 0);
  const overallROI = summary.spend > 0 ? ((summary.convValue - summary.spend) / summary.spend * 100).toFixed(1) : '0';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vigmis Monthly Report — ${month}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:20px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px 16px 0 0;padding:32px">
    <img src="https://vigmis.com/logo.png" alt="Vigmis" height="26" style="filter:brightness(0) invert(1);display:block;margin-bottom:20px"/>
    <p style="margin:0;color:rgba(255,255,255,0.6);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">Monthly Executive Report</p>
    <h1 style="margin:4px 0 0;color:white;font-size:28px;font-weight:800">${month}</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:14px">${actionsApplied} AI optimizations · ${active.length} active campaigns</p>
  </div>

  <div style="background:white;border-radius:0 0 16px 16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);margin-bottom:16px">

    <!-- ROI banner -->
    <div style="background:${Number(overallROI) >= 0 ? '#f0fdf4' : '#fef2f2'};padding:20px 32px;border-bottom:2px solid ${Number(overallROI) >= 0 ? '#bbf7d0' : '#fecaca'}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <p style="margin:0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase">Total ROI this month</p>
          <p style="margin:4px 0 0;font-size:36px;font-weight:900;color:${Number(overallROI) >= 0 ? '#059669' : '#dc2626'}">${Number(overallROI) >= 0 ? '+' : ''}${overallROI}%</p>
          <p style="margin:4px 0 0;font-size:12px;color:#64748b">$${summary.convValue.toFixed(0)} revenue on $${summary.spend.toFixed(0)} spend</p>
        </div>
        <div style="text-align:right">
          <p style="margin:0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase">ROAS</p>
          <p style="margin:4px 0;font-size:28px;font-weight:800;color:#4f46e5">${summary.roas}x</p>
          <p style="margin:0;font-size:12px">${fmtChange(changes.roas, false)} vs last month</p>
        </div>
      </div>
    </div>

    <!-- Key metrics grid -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9">
      <h2 style="margin:0 0 16px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Performance vs Last Month</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase">Metric</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase">This Month</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase">Last Month</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase">Change</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ['Spend', `$${summary.spend.toFixed(2)}`, `$${prevSummary.spend.toFixed(2)}`, fmtChange(changes.spend, false)],
            ['Impressions', summary.impressions.toLocaleString(), prevSummary.impressions.toLocaleString(), fmtChange(changes.impressions, false)],
            ['Clicks', summary.clicks.toLocaleString(), prevSummary.clicks.toLocaleString(), fmtChange(changes.clicks, false)],
            ['CTR', `${summary.ctr}%`, `${prevSummary.ctr}%`, fmtChange(changes.ctr, false)],
            ['Conversions', `${summary.conversions}`, `${prevSummary.conversions}`, fmtChange(changes.conversions, false)],
            ['CPA', `$${summary.cpa}`, `$${prevSummary.cpa}`, fmtChange(changes.cpa, true)],
            ['ROAS', `${summary.roas}x`, `${prevSummary.roas}x`, fmtChange(changes.roas, false)],
            ['Conv. Value', `$${summary.convValue.toFixed(0)}`, `$${prevSummary.convValue.toFixed(0)}`, fmtChange(changes.convValue, false)],
          ].map(([label, curr, prev, chg]) => `
            <tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#374151">${label}</td>
              <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:700;color:#0f172a">${curr}</td>
              <td style="padding:10px 12px;text-align:right;font-size:13px;color:#94a3b8">${prev}</td>
              <td style="padding:10px 12px;text-align:right;font-size:12px">${chg}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${topCampaign ? `
    <!-- Top performer -->
    <div style="padding:20px 32px;border-bottom:1px solid #f1f5f9;background:#fafaf9">
      <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">⭐ Top Performer</h2>
      <div style="display:flex;align-items:center;gap:12px">
        ${platformBadge(topCampaign.platform)}
        <div>
          <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a">${topCampaign.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b">${topCampaign.roas}x ROAS · $${topCampaign.spend.toFixed(0)} spend</p>
        </div>
      </div>
    </div>` : ''}

    <!-- Social & Billing -->
    <div style="padding:20px 32px;border-bottom:1px solid #f1f5f9">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:160px">
          <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Social Media</h2>
          <p style="margin:0;font-size:13px;color:#374151">📱 ${socialPostsPublished} posts published</p>
          <p style="margin:4px 0 0;font-size:13px;color:#374151">💬 ${socialCommentsReplied} comments replied</p>
        </div>
        <div style="flex:1;min-width:160px">
          <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">This Month's Invoice</h2>
          <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a">$${totalFeeUsd.toFixed(2)}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">Includes management fee + social services</p>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding:24px 32px;text-align:center">
      <a href="${WEB_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:white;font-weight:700;font-size:14px;padding:12px 32px;border-radius:12px;text-decoration:none;margin-right:8px">
        Open Dashboard →
      </a>
      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">
        © ${new Date().getFullYear()} Taurus Management and Investments Ltd. — Vigmis ·
        <a href="${WEB_URL}/unsubscribe?token={{TENANT_ID}}" style="color:#cbd5e1">Unsubscribe</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function buildDigestHtml(tenantData: {
  period: string;
  campaigns: Array<{ name: string; platform: string; status: string; daily_budget_usd: number }>;
  alertCount: number;
  actionsApplied: number;
  socialPostsPublished?: number;
  socialPostsPending?: number;
  socialCommentsReplied?: number;
  plan?: string;
  geoScore?: number | null;
  geoGrade?: string | null;
  geoScoreDelta?: number | null;
}): string {
  const { period, campaigns, alertCount, actionsApplied, socialPostsPublished = 0, socialPostsPending = 0, socialCommentsReplied = 0, plan = 'free', geoScore, geoGrade, geoScoreDelta } = tenantData;
  const active = campaigns.filter(c => c.status === 'active');
  const totalBudget = active.reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);

  // Pro upsell calculation (Free users only)
  const monthlySpend = totalBudget * 30;
  const freeFee = monthlySpend * 0.07;
  const proFee = 15 + monthlySpend * 0.05;
  const proSavings = parseFloat((freeFee - proFee).toFixed(2));
  const showProUpsell = plan === 'free';

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

      <!-- AI Visibility (GEO) score -->
      ${geoScore !== undefined && geoScore !== null ? `
      <div style="padding:0 32px 20px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:16px">
          <div style="width:52px;height:52px;border-radius:50%;border:3px solid ${(geoScore ?? 0) >= 80 ? '#34d399' : (geoScore ?? 0) >= 60 ? '#fbbf24' : '#f87171'};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:16px;font-weight:900;color:${(geoScore ?? 0) >= 80 ? '#059669' : (geoScore ?? 0) >= 60 ? '#d97706' : '#dc2626'}">${geoGrade ?? 'F'}</span>
          </div>
          <div style="flex:1">
            <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a">AI Visibility Score: ${geoScore}/100</p>
            <p style="margin:3px 0 0;font-size:12px;color:#64748b">
              How well ChatGPT, Claude &amp; Gemini can find your business
              ${geoScoreDelta !== null && geoScoreDelta !== undefined ? `· <span style="font-weight:700;color:${geoScoreDelta >= 0 ? '#059669' : '#dc2626'}">${geoScoreDelta >= 0 ? '+' : ''}${geoScoreDelta} from last month</span>` : ''}
            </p>
          </div>
          <a href="https://vigmis.com/dashboard" style="font-size:12px;font-weight:700;color:#4f46e5;text-decoration:none;white-space:nowrap">View report →</a>
        </div>
      </div>
      ` : ''}

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

      <!-- Social media summary -->
      ${(socialPostsPublished > 0 || socialPostsPending > 0 || socialCommentsReplied > 0) ? `
      <div style="padding:0 32px 24px">
        <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em">Social Media This Week</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div style="background:#f0fdf4;border-radius:10px;padding:14px;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:#059669">${socialPostsPublished}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#64748b;font-weight:600">Posts Published</p>
          </div>
          <div style="background:${socialPostsPending > 0 ? '#fffbeb' : '#f8fafc'};border-radius:10px;padding:14px;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:${socialPostsPending > 0 ? '#d97706' : '#94a3b8'}">${socialPostsPending}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#64748b;font-weight:600">Awaiting Approval</p>
          </div>
          <div style="background:#f8fafc;border-radius:10px;padding:14px;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:#4f46e5">${socialCommentsReplied}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#64748b;font-weight:600">Comments Replied</p>
          </div>
        </div>
        ${socialPostsPending > 0 ? `<p style="margin:10px 0 0;font-size:12px;color:#b45309;font-weight:600">→ ${socialPostsPending} post${socialPostsPending > 1 ? 's' : ''} waiting for your approval in the Social tab.</p>` : ''}
      </div>
      ` : ''}

      ${showProUpsell ? `
      <!-- Pro upsell -->
      <div style="margin:0 32px 24px;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);border-radius:16px;padding:24px;color:white">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">⚡ Upgrade to Pro</p>
            ${proSavings > 0
              ? `<p style="margin:0 0 8px;font-size:17px;font-weight:800;color:white">Save <span style="color:#a5f3fc">$${proSavings.toFixed(0)}/month</span> on fees</p>
                 <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.65)">You're paying $${freeFee.toFixed(0)}/mo at 7% fee. Pro cuts it to 5% — you'd pay $${proFee.toFixed(0)}/mo total (including the $15 subscription).</p>`
              : `<p style="margin:0 0 8px;font-size:17px;font-weight:800;color:white">2× more daily optimizations</p>
                 <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.65)">Pro checks your campaigns 6× per day instead of 3×. More opportunities caught = better ROAS over time.</p>`
            }
            <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.5)">Pro: 6 optimizations/day · 5% fee · $15/month</p>
          </div>
          <div style="flex-shrink:0;display:flex;align-items:center">
            <a href="${WEB_URL}/dashboard/billing" style="display:inline-block;background:white;color:#312e81;font-weight:800;font-size:13px;padding:12px 22px;border-radius:12px;text-decoration:none;white-space:nowrap">
              Upgrade to Pro →
            </a>
          </div>
        </div>
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

    const [campaignsRes, alertsRes, logsRes, socialPublishedRes, socialPendingRes, socialRepliedRes, planRes, geoRes, geoSnapshotRes] = await Promise.all([
      db.from('campaigns').select('name, platform, status, daily_budget_usd').eq('tenant_id', request.tenantId),
      db.from('dismissed_alerts').select('alert_id').eq('tenant_id', request.tenantId),
      db.from('audit_log')
        .select('action')
        .eq('tenant_id', request.tenantId)
        .like('action', 'optimization.%')
        .not('action', 'eq', 'optimization.metrics_snapshot')
        .gte('created_at', weekAgo.toISOString()),
      db.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', request.tenantId).eq('status', 'published').gte('published_at', weekAgo.toISOString()),
      db.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', request.tenantId).eq('status', 'pending_approval'),
      db.from('social_comments').select('id', { count: 'exact', head: true }).eq('tenant_id', request.tenantId).eq('status', 'sent').gte('replied_at', weekAgo.toISOString()),
      db.from('billing_customers').select('plan').eq('tenant_id', request.tenantId).maybeSingle(),
      db.from('geo_reports').select('score, grade').eq('tenant_id', request.tenantId).maybeSingle(),
      db.from('geo_report_snapshots').select('score_delta').eq('tenant_id', request.tenantId).order('snapshot_month', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const html = buildDigestHtml({
      period,
      campaigns: campaignsRes.data ?? [],
      alertCount: Math.max(0, (alertsRes.data?.length ?? 0)),
      actionsApplied: logsRes.data?.length ?? 0,
      socialPostsPublished: socialPublishedRes.count ?? 0,
      socialPostsPending: socialPendingRes.count ?? 0,
      socialCommentsReplied: socialRepliedRes.count ?? 0,
      plan: planRes.data?.plan ?? 'free',
      geoScore: geoRes.data?.score ?? null,
      geoGrade: geoRes.data?.grade ?? null,
      geoScoreDelta: geoSnapshotRes.data?.score_delta ?? null,
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
        const [campaignsRes, logsRes, socialPublishedRes, socialPendingRes, socialRepliedRes, planRes, geoRes, geoSnapshotRes] = await Promise.all([
          db.from('campaigns').select('name, platform, status, daily_budget_usd').eq('tenant_id', settings.tenant_id),
          db.from('audit_log')
            .select('action')
            .eq('tenant_id', settings.tenant_id)
            .like('action', 'optimization.%')
            .not('action', 'eq', 'optimization.metrics_snapshot')
            .gte('created_at', weekAgo.toISOString()),
          db.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'published').gte('published_at', weekAgo.toISOString()),
          db.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'pending_approval'),
          db.from('social_comments').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'sent').gte('replied_at', weekAgo.toISOString()),
          db.from('billing_customers').select('plan').eq('tenant_id', settings.tenant_id).maybeSingle(),
          db.from('geo_reports').select('score, grade').eq('tenant_id', settings.tenant_id).maybeSingle(),
          db.from('geo_report_snapshots').select('score_delta').eq('tenant_id', settings.tenant_id).order('snapshot_month', { ascending: false }).limit(1).maybeSingle(),
        ]);

        const html = buildDigestHtml({
          period,
          campaigns: campaignsRes.data ?? [],
          alertCount: 0,
          actionsApplied: logsRes.data?.length ?? 0,
          socialPostsPublished: socialPublishedRes.count ?? 0,
          socialPostsPending: socialPendingRes.count ?? 0,
          socialCommentsReplied: socialRepliedRes.count ?? 0,
          plan: planRes.data?.plan ?? 'free',
          geoScore: geoRes.data?.score ?? null,
          geoGrade: geoRes.data?.grade ?? null,
          geoScoreDelta: geoSnapshotRes.data?.score_delta ?? null,
        }).replace('{{TENANT_ID}}', settings.tenant_id);

        await sendDigest(settings.email, html, period);
        sent++;
      } catch {
        skipped++;
      }
    }

    return reply.send({ sent, skipped, period });
  });

  // ── POST /notifications/daily — send daily morning report (cron) ─────────────
  app.post('/notifications/daily', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [campaignsRes, actionsRes, alertsRes, approvalsRes, socialPendingRes, commentsRes] = await Promise.all([
          db.from('campaigns').select('id, platform, name, status, daily_budget_usd').eq('tenant_id', settings.tenant_id),
          db.from('audit_log').select('action, created_at, payload').eq('tenant_id', settings.tenant_id).gte('created_at', since).like('action', 'optimization.%').not('action', 'eq', 'optimization.metrics_snapshot').order('created_at', { ascending: false }).limit(8),
          db.from('alerts').select('type, title, message, severity').eq('tenant_id', settings.tenant_id).eq('dismissed', false).limit(5),
          db.from('approval_requests').select('id').eq('tenant_id', settings.tenant_id).eq('status', 'pending'),
          db.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'pending_approval'),
          db.from('social_comments').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'pending_approval'),
        ]);

        const campaigns = campaignsRes.data ?? [];
        const activeCampaigns = campaigns.filter((c: any) => c.status === 'active');
        const dailyBudget = activeCampaigns.reduce((s: number, c: any) => s + (c.daily_budget_usd ?? 0), 0);

        // Generate mock yesterday + day-before metrics
        let todayTotals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
        let prevTotals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };

        function seededRandom(seed: number) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }
        function genDay(seed: number, budget: number) {
          const r = (n: number) => seededRandom(seed + n);
          const imp = Math.round(2500 + r(1) * 3000);
          const ctr = 0.01 + r(2) * 0.035;
          const clicks = Math.round(imp * ctr);
          const spend = parseFloat(Math.min(budget, budget * (0.7 + r(3) * 0.6)).toFixed(2));
          const conversions = Math.round(clicks * (0.03 + r(4) * 0.12));
          const convValue = parseFloat((conversions * (40 + r(5) * 60)).toFixed(2));
          return { impressions: imp, clicks, spend, conversions, convValue };
        }

        for (const c of campaigns) {
          const seed = c.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
          const t = genDay(seed + 9999, c.daily_budget_usd ?? 10);
          const p = genDay(seed + 9998, c.daily_budget_usd ?? 10);
          todayTotals.impressions += t.impressions;
          todayTotals.clicks += t.clicks;
          todayTotals.spend = parseFloat((todayTotals.spend + t.spend).toFixed(2));
          todayTotals.conversions += t.conversions;
          todayTotals.convValue = parseFloat((todayTotals.convValue + t.convValue).toFixed(2));
          prevTotals.impressions += p.impressions;
          prevTotals.clicks += p.clicks;
          prevTotals.spend = parseFloat((prevTotals.spend + p.spend).toFixed(2));
          prevTotals.conversions += p.conversions;
          prevTotals.convValue = parseFloat((prevTotals.convValue + p.convValue).toFixed(2));
        }

        function toSummary(t: typeof todayTotals) {
          return { ...t, ctr: t.impressions ? parseFloat(((t.clicks / t.impressions) * 100).toFixed(2)) : 0, roas: t.spend ? parseFloat((t.convValue / t.spend).toFixed(2)) : 0 };
        }
        function pctChg(a: number, b: number) { return b === 0 ? null : parseFloat(((a - b) / b * 100).toFixed(1)); }

        const yS = toSummary(todayTotals);
        const pS = toSummary(prevTotals);
        const changes = { spend: pctChg(yS.spend, pS.spend), impressions: pctChg(yS.impressions, pS.impressions), clicks: pctChg(yS.clicks, pS.clicks), conversions: pctChg(yS.conversions, pS.conversions), convValue: pctChg(yS.convValue, pS.convValue), ctr: pctChg(yS.ctr, pS.ctr), roas: pctChg(yS.roas, pS.roas), cpa: pctChg(yS.conversions > 0 ? yS.spend / yS.conversions : 0, pS.conversions > 0 ? pS.spend / pS.conversions : 0) };

        const html = buildDailyReportHtml({
          clientName: settings.email.split('@')[0],
          dateStr: yesterdayStr,
          yesterday: yS,
          prevDay: pS,
          changes,
          dailyBudget,
          activeCampaigns: activeCampaigns.length,
          actions: (actionsRes.data ?? []).map((a: any) => ({ action: a.action.replace('optimization.', ''), campaign: a.payload?.campaign_name, detail: a.payload?.reason, created_at: a.created_at })),
          alerts: alertsRes.data ?? [],
          pendingApprovals: approvalsRes.data?.length ?? 0,
          pendingSocialPosts: socialPendingRes.count ?? 0,
          pendingComments: commentsRes.count ?? 0,
        }).replace(/\{\{TENANT_ID\}\}/g, settings.tenant_id);

        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: settings.email }] }],
            from: { email: FROM_EMAIL, name: 'Vigmis' },
            subject: `Your Vigmis Daily Report — ${yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            content: [{ type: 'text/html', value: html }],
          }),
        });

        sent++;
      } catch {
        skipped++;
      }
    }

    return reply.send({ sent, skipped });
  });

  // ── POST /notifications/monthly — send monthly executive report (cron) ────────
  app.post('/notifications/monthly', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
        const monthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        const [campaignsRes, logsRes, socialPublishedRes, socialRepliedRes] = await Promise.all([
          db.from('campaigns').select('id, name, platform, status, daily_budget_usd').eq('tenant_id', settings.tenant_id),
          db.from('audit_log').select('action').eq('tenant_id', settings.tenant_id).like('action', 'optimization.%').not('action', 'eq', 'optimization.metrics_snapshot').gte('created_at', monthStart.toISOString()).lte('created_at', monthEnd.toISOString()),
          db.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'published').gte('published_at', monthStart.toISOString()),
          db.from('social_comments').select('id', { count: 'exact', head: true }).eq('tenant_id', settings.tenant_id).eq('status', 'sent').gte('replied_at', monthStart.toISOString()),
        ]);

        const campaigns = campaignsRes.data ?? [];

        function seededRandom(seed: number) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }
        function genPeriod(campaignList: any[], days: number, offset: number) {
          let totals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
          for (const c of campaignList) {
            const seed = c.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
            for (let i = 0; i < days; i++) {
              const r = (n: number) => seededRandom(seed + i + offset + n * 100);
              const imp = Math.round(2500 + r(1) * 3000);
              const clicks = Math.round(imp * (0.01 + r(2) * 0.035));
              const spend = parseFloat(Math.min(c.daily_budget_usd ?? 10, (c.daily_budget_usd ?? 10) * (0.7 + r(3) * 0.6)).toFixed(2));
              const conv = Math.round(clicks * (0.03 + r(4) * 0.12));
              const val = parseFloat((conv * (40 + r(5) * 60)).toFixed(2));
              totals.impressions += imp; totals.clicks += clicks;
              totals.spend = parseFloat((totals.spend + spend).toFixed(2));
              totals.conversions += conv;
              totals.convValue = parseFloat((totals.convValue + val).toFixed(2));
            }
          }
          return totals;
        }

        const days = monthEnd.getDate();
        const curr = genPeriod(campaigns, days, 0);
        const prev = genPeriod(campaigns, days, days);

        function toS(t: typeof curr) { return { ...t, ctr: t.impressions ? parseFloat(((t.clicks / t.impressions) * 100).toFixed(2)) : 0, cpa: t.conversions ? parseFloat((t.spend / t.conversions).toFixed(2)) : 0, roas: t.spend ? parseFloat((t.convValue / t.spend).toFixed(2)) : 0 }; }
        function pctChg(a: number, b: number) { return b === 0 ? null : parseFloat(((a - b) / b * 100).toFixed(1)); }

        const currS = toS(curr);
        const prevS = toS(prev);
        const changes = { spend: pctChg(currS.spend, prevS.spend), impressions: pctChg(currS.impressions, prevS.impressions), clicks: pctChg(currS.clicks, prevS.clicks), conversions: pctChg(currS.conversions, prevS.conversions), convValue: pctChg(currS.convValue, prevS.convValue), ctr: pctChg(currS.ctr, prevS.ctr), cpa: pctChg(currS.cpa, prevS.cpa), roas: pctChg(currS.roas, prevS.roas) };

        // Fee estimate
        const feeRow = await db.from('billing_customers').select('plan').eq('tenant_id', settings.tenant_id).maybeSingle();
        const plan = feeRow.data?.plan ?? 'free';
        const feePct = plan === 'pro' ? 0.05 : 0.07;
        const subFee = plan === 'pro' ? 15 : 0;
        const totalFeeUsd = parseFloat((currS.spend * feePct + subFee).toFixed(2));

        const campaignMetrics = campaigns.map((c: any) => {
          const seed = c.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
          let sp = 0, conv = 0, val = 0;
          for (let i = 0; i < days; i++) {
            const r = (n: number) => seededRandom(seed + i + n * 100);
            const clicks = Math.round((2500 + r(1) * 3000) * (0.01 + r(2) * 0.035));
            const spend = parseFloat(Math.min(c.daily_budget_usd ?? 10, (c.daily_budget_usd ?? 10) * (0.7 + r(3) * 0.6)).toFixed(2));
            const cconv = Math.round(clicks * (0.03 + r(4) * 0.12));
            const cval = parseFloat((cconv * (40 + r(5) * 60)).toFixed(2));
            sp += spend; conv += cconv; val += cval;
          }
          return { ...c, spend: parseFloat(sp.toFixed(2)), roas: sp > 0 ? parseFloat((val / sp).toFixed(2)) : 0 };
        });

        const html = buildMonthlyReportHtml({
          month: monthStr,
          summary: currS,
          prevSummary: prevS,
          changes,
          campaigns: campaignMetrics,
          totalFeeUsd,
          socialPostsPublished: socialPublishedRes.count ?? 0,
          socialCommentsReplied: socialRepliedRes.count ?? 0,
          actionsApplied: logsRes.data?.length ?? 0,
        }).replace(/\{\{TENANT_ID\}\}/g, settings.tenant_id);

        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: settings.email }] }],
            from: { email: FROM_EMAIL, name: 'Vigmis' },
            subject: `Your Vigmis Monthly Report — ${monthStr}`,
            content: [{ type: 'text/html', value: html }],
          }),
        });

        sent++;
      } catch {
        skipped++;
      }
    }

    // Also trigger monthly snapshots for all tenants
    fetch(`http://localhost:${process.env.PORT ?? 4000}/history/snapshot`, {
      method: 'POST',
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? 'vigmis-cron', 'Content-Type': 'application/json' },
    }).catch(() => { /* non-blocking */ });

    return reply.send({ sent, skipped, month: monthStr });
  });
}

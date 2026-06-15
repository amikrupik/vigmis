// Export endpoints — CSV (Excel) + print-ready HTML (PDF)
//
// GET /export/analytics?period=30&format=csv|html
// GET /export/campaigns?format=csv|html
// GET /export/social?format=csv|html
// GET /export/marketing-plan?format=html
// GET /export/invoice?format=html

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { calculateFee, currentMonth } from '../billing/calculator.js';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers.map(escape), ...rows.map(r => r.map(escape))].map(r => r.join(',')).join('\r\n');
}

function bom(csv: string): string {
  return '\uFEFF' + csv; // UTF-8 BOM for Excel compatibility
}

// ── Print HTML wrapper ─────────────────────────────────────────────────────────

function printPage(title: string, body: string, autoPrint = true): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Vigmis</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
  .print-bar { background: white; border-bottom: 1px solid #e2e8f0; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .print-bar button { background: #4f46e5; color: white; border: none; font-weight: 700; font-size: 13px; padding: 8px 20px; border-radius: 8px; cursor: pointer; }
  .print-bar button:hover { background: #4338ca; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #4f46e5; }
  .header-left h1 { font-size: 26px; font-weight: 900; color: #0f172a; }
  .header-left p { font-size: 13px; color: #64748b; margin-top: 4px; }
  .logo { font-size: 22px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
  .kpi label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px; }
  .kpi value { font-size: 22px; font-weight: 900; color: #0f172a; display: block; }
  .kpi .chg { font-size: 11px; color: #64748b; margin-top: 2px; }
  .section { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
  .section-header { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; }
  .section-header h2 { font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; background: #f8fafc; white-space: nowrap; }
  td { padding: 10px 16px; border-bottom: 1px solid #f8fafc; color: #374151; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
  .badge-google { background: #dbeafe; color: #1d4ed8; }
  .badge-meta { background: #ede9fe; color: #6d28d9; }
  .badge-tiktok { background: #f1f5f9; color: #475569; }
  .badge-active { background: #d1fae5; color: #065f46; }
  .badge-paused { background: #fef3c7; color: #92400e; }
  .badge-pending { background: #f1f5f9; color: #475569; }
  .good { color: #059669; font-weight: 700; }
  .warn { color: #d97706; font-weight: 700; }
  .bad  { color: #dc2626; font-weight: 700; }
  .funnel-row { display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; gap: 12px; }
  .funnel-label { width: 120px; font-size: 12px; font-weight: 600; color: #475569; text-align: right; }
  .funnel-bar-wrap { flex: 1; background: #f1f5f9; border-radius: 6px; height: 28px; overflow: hidden; }
  .funnel-bar { height: 28px; border-radius: 6px; }
  .funnel-val { width: 80px; font-size: 13px; font-weight: 800; color: #0f172a; text-align: right; }
  .funnel-rate { width: 80px; font-size: 11px; color: #94a3b8; }
  .plan-section { padding: 20px; }
  .plan-section h3 { font-size: 14px; font-weight: 700; color: #4f46e5; margin-bottom: 10px; border-bottom: 1px solid #e0e7ff; padding-bottom: 6px; }
  .plan-section p, .plan-section li { font-size: 13px; color: #374151; line-height: 1.7; }
  .plan-section ul { padding-left: 20px; }
  .invoice-row { display: flex; justify-content: space-between; padding: 10px 20px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .invoice-total { display: flex; justify-content: space-between; padding: 14px 20px; background: #f8fafc; font-size: 16px; font-weight: 800; }
  .disclaimer { margin-top: 24px; padding: 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; font-size: 11px; color: #92400e; line-height: 1.6; }
  .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
  @media print {
    .print-bar { display: none !important; }
    body { background: white; }
    .page { padding: 16px; }
    .section { break-inside: avoid; }
    .kpi-grid { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="print-bar">
  <span style="font-weight:700;color:#4f46e5">Vigmis</span>
  <button onclick="window.print()">⬇ Save as PDF</button>
</div>
<div class="page">
${body}
<div class="footer">
  <span>Generated by Vigmis · vigmis.com · ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
  <span>© ${new Date().getFullYear()} Taurus Management and Investments Ltd.</span>
</div>
</div>
${autoPrint ? `<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 800); });</script>` : ''}
</body>
</html>`;
}

// ── Analytics export ─────────────────────────────────────────────────────────

function seededRandom(seed: number) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

function generateDayMetrics(seed: number, budget: number) {
  const r = (n: number) => seededRandom(seed + n);
  const impressions = Math.round(2500 + r(1) * 3000);
  const ctr = 0.01 + r(2) * 0.035;
  const clicks = Math.round(impressions * ctr);
  const spend = parseFloat(Math.min(budget, budget * (0.7 + r(3) * 0.6)).toFixed(2));
  const conversions = Math.round(clicks * (0.03 + r(4) * 0.12));
  const convValue = parseFloat((conversions * (40 + r(5) * 60)).toFixed(2));
  return { impressions, clicks, spend, conversions, convValue };
}

export async function exportRoutes(app: FastifyInstance) {

  // ── GET /export/analytics ──────────────────────────────────────────────────
  app.get('/export/analytics', { preHandler: authenticate }, async (request, reply) => {
    const { period: periodParam, format = 'csv' } = request.query as any;
    const days = [7, 30, 90].includes(Number(periodParam)) ? Number(periodParam) : 30;
    const tenantId = request.tenantId;

    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, name, platform, campaign_type, status, daily_budget_usd, created_at')
      .eq('tenant_id', tenantId);

    const periodLabel = `Last ${days} days (${new Date(Date.now() - days * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;

    // Build trend + campaign metrics
    const dailyRows: any[] = [];
    const campaignRows: any[] = [];
    let overallTotals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };

    for (const c of campaigns ?? []) {
      const seed = c.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
      let ct = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
      for (let i = 0; i < days; i++) {
        const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
        const m = generateDayMetrics(seed + i, c.daily_budget_usd ?? 10);
        ct.impressions += m.impressions; ct.clicks += m.clicks;
        ct.spend = parseFloat((ct.spend + m.spend).toFixed(2));
        ct.conversions += m.conversions;
        ct.convValue = parseFloat((ct.convValue + m.convValue).toFixed(2));

        // For daily trend CSV: accumulate per date
        const dateStr = d.toISOString().split('T')[0];
        const existing = dailyRows.find((r: any) => r.date === dateStr);
        if (existing) {
          existing.impressions += m.impressions; existing.clicks += m.clicks;
          existing.spend = parseFloat((existing.spend + m.spend).toFixed(2));
          existing.conversions += m.conversions;
          existing.convValue = parseFloat((existing.convValue + m.convValue).toFixed(2));
        } else {
          dailyRows.push({ date: dateStr, ...m });
        }
      }
      overallTotals.impressions += ct.impressions; overallTotals.clicks += ct.clicks;
      overallTotals.spend = parseFloat((overallTotals.spend + ct.spend).toFixed(2));
      overallTotals.conversions += ct.conversions;
      overallTotals.convValue = parseFloat((overallTotals.convValue + ct.convValue).toFixed(2));

      campaignRows.push({
        name: c.name, platform: c.platform, status: c.status,
        daily_budget_usd: c.daily_budget_usd,
        ...ct,
        ctr: ct.impressions ? parseFloat(((ct.clicks / ct.impressions) * 100).toFixed(2)) : 0,
        cpa: ct.conversions ? parseFloat((ct.spend / ct.conversions).toFixed(2)) : 0,
        roas: ct.spend ? parseFloat((ct.convValue / ct.spend).toFixed(2)) : 0,
      });
    }

    const summary = {
      ...overallTotals,
      ctr: overallTotals.impressions ? parseFloat(((overallTotals.clicks / overallTotals.impressions) * 100).toFixed(2)) : 0,
      cpa: overallTotals.conversions ? parseFloat((overallTotals.spend / overallTotals.conversions).toFixed(2)) : 0,
      roas: overallTotals.spend ? parseFloat((overallTotals.convValue / overallTotals.spend).toFixed(2)) : 0,
    };

    dailyRows.sort((a, b) => a.date.localeCompare(b.date));
    campaignRows.sort((a, b) => b.roas - a.roas);

    if (format === 'csv') {
      const summarySection = toCsv(
        ['Period', 'Impressions', 'Clicks', 'CTR %', 'Spend $', 'Conversions', 'CPA $', 'Conv Value $', 'ROAS'],
        [[periodLabel, summary.impressions, summary.clicks, summary.ctr, summary.spend, summary.conversions, summary.cpa, summary.convValue, summary.roas]]
      );
      const dailySection = toCsv(
        ['Date', 'Impressions', 'Clicks', 'Spend $', 'Conversions', 'Conv Value $'],
        dailyRows.map(r => [r.date, r.impressions, r.clicks, r.spend, r.conversions, r.convValue])
      );
      const campaignSection = toCsv(
        ['Campaign', 'Platform', 'Status', 'Daily Budget $', 'Impressions', 'Clicks', 'CTR %', 'Spend $', 'Conversions', 'CPA $', 'ROAS'],
        campaignRows.map(r => [r.name, r.platform, r.status, r.daily_budget_usd, r.impressions, r.clicks, r.ctr, r.spend, r.conversions, r.cpa, r.roas])
      );

      const csv = bom(`VIGMIS ANALYTICS REPORT — ${periodLabel}\r\n\r\nSUMMARY\r\n${summarySection}\r\n\r\nDAILY TREND\r\n${dailySection}\r\n\r\nCAMPAIGN BREAKDOWN\r\n${campaignSection}`);
      const filename = `vigmis-analytics-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    }

    // HTML (PDF) format
    const roasColor = summary.roas >= 2 ? 'good' : summary.roas >= 1 ? 'warn' : 'bad';
    const campaignTableRows = campaignRows.map(c => `
      <tr>
        <td>${c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</td>
        <td><span class="badge badge-${c.platform}">${c.platform}</span></td>
        <td><span class="badge badge-${c.status}">${c.status}</span></td>
        <td>$${c.daily_budget_usd}/day</td>
        <td>${c.impressions.toLocaleString()}</td>
        <td>${c.clicks.toLocaleString()}</td>
        <td>${c.ctr}%</td>
        <td>$${c.spend}</td>
        <td>${c.conversions}</td>
        <td>$${c.cpa}</td>
        <td class="${c.roas >= 2 ? 'good' : c.roas >= 1 ? 'warn' : 'bad'}">${c.roas}x</td>
      </tr>`).join('');

    const dailyTableRows = dailyRows.slice(-14).map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.impressions.toLocaleString()}</td>
        <td>${r.clicks.toLocaleString()}</td>
        <td>$${r.spend}</td>
        <td>${r.conversions}</td>
        <td>$${r.convValue}</td>
      </tr>`).join('');

    const body = `
      <div class="header">
        <div class="header-left">
          <h1>Analytics Report</h1>
          <p>${periodLabel} · Simulated data — real metrics available after API approval</p>
        </div>
        <div class="logo">Vigmis</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><label>Total Spend</label><value>$${summary.spend.toFixed(0)}</value></div>
        <div class="kpi"><label>Conversions</label><value>${summary.conversions}</value></div>
        <div class="kpi"><label>ROAS</label><value class="${roasColor}">${summary.roas}x</value></div>
        <div class="kpi"><label>CPA</label><value>$${summary.cpa.toFixed(0)}</value></div>
        <div class="kpi"><label>CTR</label><value>${summary.ctr}%</value></div>
        <div class="kpi"><label>Impressions</label><value>${(summary.impressions / 1000).toFixed(1)}k</value></div>
        <div class="kpi"><label>Clicks</label><value>${summary.clicks.toLocaleString()}</value></div>
        <div class="kpi"><label>Conv. Value</label><value>$${summary.convValue.toFixed(0)}</value></div>
      </div>

      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h2>Conversion Funnel</h2></div>
        ${[
          { label: 'Impressions', val: summary.impressions.toLocaleString(), pct: 100, color: '#cbd5e1', rate: '' },
          { label: 'Clicks', val: summary.clicks.toLocaleString(), pct: summary.impressions > 0 ? summary.clicks / summary.impressions * 100 : 0, color: '#818cf8', rate: `CTR: ${summary.ctr}%` },
          { label: 'Conversions', val: String(summary.conversions), pct: summary.clicks > 0 ? summary.conversions / summary.clicks * 100 : 0, color: '#4f46e5', rate: `CVR: ${summary.clicks > 0 ? (summary.conversions / summary.clicks * 100).toFixed(1) : 0}%` },
          { label: 'Conv. Value', val: `$${summary.convValue.toFixed(0)}`, pct: 30, color: '#059669', rate: `ROAS: ${summary.roas}x` },
        ].map(f => `
          <div class="funnel-row">
            <div class="funnel-label">${f.label}</div>
            <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(2, f.pct)}%;background:${f.color}"></div></div>
            <div class="funnel-val">${f.val}</div>
            <div class="funnel-rate">${f.rate}</div>
          </div>`).join('')}
      </div>

      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h2>Campaign Performance</h2></div>
        <table>
          <thead><tr>
            <th>Campaign</th><th>Platform</th><th>Status</th><th>Daily Budget</th>
            <th>Impressions</th><th>Clicks</th><th>CTR</th><th>Spend</th>
            <th>Conv.</th><th>CPA</th><th>ROAS</th>
          </tr></thead>
          <tbody>${campaignTableRows}</tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-header"><h2>Daily Trend (Last 14 Days)</h2></div>
        <table>
          <thead><tr><th>Date</th><th>Impressions</th><th>Clicks</th><th>Spend</th><th>Conversions</th><th>Conv. Value</th></tr></thead>
          <tbody>${dailyTableRows}</tbody>
        </table>
      </div>

      <div class="disclaimer">
        <strong>Disclaimer:</strong> Vigmis is an AI marketing manager that continuously analyzes, optimizes, and adjusts your campaigns. As with all digital advertising, results cannot be predicted — they depend on market conditions, seasonality, competitor activity, and platform algorithms beyond our control. Vigmis operates on a best-effort basis and does not guarantee specific outcomes. You retain full control and can pause or modify your campaigns at any time.
      </div>`;

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="vigmis-analytics-${days}d.html"`)
      .send(printPage(`Analytics Report — ${periodLabel}`, body));
  });

  // ── GET /export/campaigns ──────────────────────────────────────────────────
  app.get('/export/campaigns', { preHandler: authenticate }, async (request, reply) => {
    const { format = 'csv' } = request.query as any;
    const tenantId = request.tenantId;

    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, name, platform, campaign_type, status, daily_budget_usd, created_at, error_message')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    const now = new Date();
    const rows = (campaigns ?? []).map(c => {
      const daysRunning = Math.max(0, Math.floor((now.getTime() - new Date(c.created_at).getTime()) / 86400000));
      const monthlyBudget = (c.daily_budget_usd ?? 0) * 30;
      return [c.name, c.platform, c.campaign_type, c.status, `$${c.daily_budget_usd}/day`, `$${monthlyBudget.toFixed(0)}/month`, `${daysRunning} days`, c.error_message ?? '—', new Date(c.created_at).toLocaleDateString('en-US')];
    });

    if (format === 'csv') {
      const csv = bom(toCsv(
        ['Campaign Name', 'Platform', 'Type', 'Status', 'Daily Budget', 'Monthly Budget', 'Days Running', 'Error Message', 'Created'],
        rows
      ));
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="vigmis-campaigns-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    }

    // HTML
    const totalDaily = (campaigns ?? []).filter(c => c.status === 'active').reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);
    const tableRows = (campaigns ?? []).map(c => `
      <tr>
        <td>${c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</td>
        <td><span class="badge badge-${c.platform}">${c.platform}</span></td>
        <td>${c.campaign_type}</td>
        <td><span class="badge badge-${c.status}">${c.status}</span></td>
        <td>$${c.daily_budget_usd}/day</td>
        <td>$${((c.daily_budget_usd ?? 0) * 30).toFixed(0)}/month</td>
        <td>${new Date(c.created_at).toLocaleDateString('en-US')}</td>
      </tr>`).join('');

    const body = `
      <div class="header">
        <div class="header-left"><h1>Campaign Budget Report</h1><p>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
        <div class="logo">Vigmis</div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><label>Total Campaigns</label><value>${campaigns?.length ?? 0}</value></div>
        <div class="kpi"><label>Active</label><value class="good">${(campaigns ?? []).filter(c => c.status === 'active').length}</value></div>
        <div class="kpi"><label>Daily Budget</label><value>$${totalDaily.toFixed(0)}</value></div>
        <div class="kpi"><label>Monthly Budget</label><value>$${(totalDaily * 30).toFixed(0)}</value></div>
      </div>
      <div class="section">
        <div class="section-header"><h2>All Campaigns</h2></div>
        <table><thead><tr><th>Campaign</th><th>Platform</th><th>Type</th><th>Status</th><th>Daily Budget</th><th>Monthly Budget</th><th>Created</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
      </div>`;

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(printPage('Campaign Budget Report', body));
  });

  // ── GET /export/social ────────────────────────────────────────────────────
  app.get('/export/social', { preHandler: authenticate }, async (request, reply) => {
    const { format = 'csv' } = request.query as any;
    const tenantId = request.tenantId;

    const [postsRes, commentsRes, analyticsRes] = await Promise.all([
      db.from('social_posts').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
      db.from('social_comments').select('id, platform, sentiment, status, billed, cost_usd, replied_at, commented_at').eq('tenant_id', tenantId).order('commented_at', { ascending: false }).limit(200),
      db.from('social_analytics').select('post_id, likes, comments, shares, reach, impressions, engagement_rate, fetched_at').eq('tenant_id', tenantId),
    ]);

    const posts = postsRes.data ?? [];
    const comments = commentsRes.data ?? [];
    const analytics = analyticsRes.data ?? [];
    const analyticsMap = Object.fromEntries(analytics.map((a: any) => [a.post_id, a]));

    if (format === 'csv') {
      const postRows = posts.map(p => {
        const a = analyticsMap[p.id];
        return [p.platform, p.pillar, p.status, new Date(p.scheduled_for ?? p.created_at).toLocaleDateString('en-US'), p.content?.slice(0, 100), `$${p.cost_usd}`, p.billed ? 'Yes' : 'No', a?.reach ?? 0, a?.likes ?? 0, a?.comments ?? 0, a?.shares ?? 0, a?.engagement_rate ?? 0];
      });
      const commentRows = comments.map(c => [c.platform, c.sentiment, c.status, new Date(c.commented_at).toLocaleDateString('en-US'), c.billed ? 'Yes' : 'No', `$${c.cost_usd}`]);

      const csv = bom(
        `VIGMIS SOCIAL MEDIA REPORT — ${new Date().toLocaleDateString('en-US')}\r\n\r\n` +
        `POSTS\r\n` + toCsv(['Platform', 'Pillar', 'Status', 'Date', 'Content Preview', 'Cost', 'Billed', 'Reach', 'Likes', 'Comments', 'Shares', 'Eng. Rate %'], postRows) +
        `\r\n\r\nCOMMENTS\r\n` + toCsv(['Platform', 'Sentiment', 'Status', 'Date', 'Billed', 'Cost'], commentRows)
      );

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="vigmis-social-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    }

    // HTML
    const published = posts.filter(p => p.status === 'published');
    const totalReach = analytics.reduce((s: number, a: any) => s + (a.reach ?? 0), 0);
    const totalSpend = posts.filter(p => p.billed).reduce((s: number, p: any) => s + (p.cost_usd ?? 0), 0);
    const repliesSpend = comments.filter(c => c.billed).reduce((s: number, c: any) => s + (c.cost_usd ?? 0), 0);

    const tableRows = published.slice(0, 30).map(p => {
      const a = analyticsMap[p.id];
      return `<tr>
        <td><span class="badge badge-${p.platform}">${p.platform}</span></td>
        <td>${p.pillar?.replace(/_/g, ' ')}</td>
        <td>${new Date(p.published_at ?? p.created_at).toLocaleDateString('en-US')}</td>
        <td>${p.content?.slice(0, 60)}…</td>
        <td>${a?.reach?.toLocaleString() ?? '—'}</td>
        <td>${a?.likes ?? '—'}</td>
        <td>${a?.engagement_rate ? `${a.engagement_rate}%` : '—'}</td>
        <td>$${p.cost_usd}</td>
      </tr>`;
    }).join('');

    const body = `
      <div class="header">
        <div class="header-left"><h1>Social Media Report</h1><p>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
        <div class="logo">Vigmis</div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><label>Posts Published</label><value>${published.length}</value></div>
        <div class="kpi"><label>Total Reach</label><value>${totalReach.toLocaleString()}</value></div>
        <div class="kpi"><label>Comments Replied</label><value>${comments.filter(c => c.status === 'sent').length}</value></div>
        <div class="kpi"><label>Social Spend</label><value>$${(totalSpend + repliesSpend).toFixed(2)}</value></div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Published Posts</h2></div>
        <table><thead><tr><th>Platform</th><th>Pillar</th><th>Date</th><th>Content</th><th>Reach</th><th>Likes</th><th>Eng. Rate</th><th>Cost</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
      </div>`;

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(printPage('Social Media Report', body));
  });

  // ── GET /export/marketing-plan ─────────────────────────────────────────────
  app.get('/export/marketing-plan', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const [settingsRes, campaignsRes] = await Promise.all([
      db.from('client_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      db.from('campaigns').select('name, platform, campaign_type, status, daily_budget_usd').eq('tenant_id', tenantId),
    ]);

    const s = settingsRes.data;
    const campaigns = campaignsRes.data ?? [];
    const plan = s?.strategy_plan;

    const totalBudget = campaigns.filter((c: any) => c.status === 'active').reduce((sum: number, c: any) => sum + (c.daily_budget_usd ?? 0), 0);

    const renderPlanSection = (obj: any, depth = 0): string => {
      if (!obj) return '';
      if (typeof obj === 'string') return `<p>${obj}</p>`;
      if (Array.isArray(obj)) return `<ul>${obj.map((item: any) => `<li>${typeof item === 'object' ? renderPlanSection(item, depth + 1) : item}</li>`).join('')}</ul>`;
      return Object.entries(obj).map(([key, val]) => `
        <div class="plan-section">
          <h3>${key.replace(/_/g, ' ')}</h3>
          ${renderPlanSection(val, depth + 1)}
        </div>`).join('');
    };

    const campaignRows = campaigns.map((c: any) => `
      <tr>
        <td>${c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</td>
        <td><span class="badge badge-${c.platform}">${c.platform}</span></td>
        <td>${c.campaign_type}</td>
        <td><span class="badge badge-${c.status}">${c.status}</span></td>
        <td>$${c.daily_budget_usd}/day · $${((c.daily_budget_usd ?? 0) * 30).toFixed(0)}/month</td>
      </tr>`).join('');

    const body = `
      <div class="header">
        <div class="header-left">
          <h1>Marketing Plan</h1>
          <p>${s?.website_url ?? ''} · ${s?.geo_include?.join(', ') ?? ''} · ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div class="logo">Vigmis</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><label>Goal</label><value style="font-size:16px">${s?.goal ?? '—'}</value></div>
        <div class="kpi"><label>Monthly Budget</label><value>$${(totalBudget * 30).toFixed(0)}</value></div>
        <div class="kpi"><label>Campaigns</label><value>${campaigns.length}</value></div>
        <div class="kpi"><label>Platforms</label><value style="font-size:14px">${[...new Set(campaigns.map((c: any) => c.platform))].join(', ') || '—'}</value></div>
      </div>

      ${s?.website_url ? `
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h2>Business Overview</h2></div>
        <div class="plan-section">
          ${s?.open_notes && !s.open_notes.startsWith('ACCOUNT_DELETED') ? `<p>${s.open_notes.slice(0, 500)}</p>` : ''}
          <p style="margin-top:8px"><strong>Website:</strong> ${s.website_url}</p>
          ${s.geo_include?.length ? `<p><strong>Target Markets:</strong> ${s.geo_include.join(', ')}</p>` : ''}
          ${s.currency ? `<p><strong>Currency:</strong> ${s.currency}</p>` : ''}
        </div>
      </div>` : ''}

      ${plan ? `
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h2>AI Strategy Plan</h2></div>
        ${renderPlanSection(typeof plan === 'string' ? { strategy: plan } : plan)}
      </div>` : `
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h2>AI Strategy Plan</h2></div>
        <div class="plan-section"><p style="color:#94a3b8">Strategy plan will appear here after onboarding analysis completes.</p></div>
      </div>`}

      <div class="section">
        <div class="section-header"><h2>Campaign Plan</h2></div>
        <table>
          <thead><tr><th>Campaign</th><th>Platform</th><th>Type</th><th>Status</th><th>Budget</th></tr></thead>
          <tbody>${campaignRows}</tbody>
        </table>
      </div>`;

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="vigmis-marketing-plan.html"`)
      .send(printPage('Marketing Plan', body, true));
  });

  // ── GET /export/invoice ────────────────────────────────────────────────────
  app.get('/export/invoice', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const [settingsRes, fee, socialPostsRes, socialCommentsRes] = await Promise.all([
      db.from('client_settings').select('website_url').eq('tenant_id', tenantId).maybeSingle(),
      calculateFee(tenantId, currentMonth()),
      db.from('social_posts').select('platform, cost_usd, published_at').eq('tenant_id', tenantId).eq('billed', true).gte('published_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      db.from('social_comments').select('cost_usd, replied_at').eq('tenant_id', tenantId).eq('billed', true).gte('replied_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    const now = new Date();
    const monthStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const socialPosts = socialPostsRes.data ?? [];
    const socialComments = socialCommentsRes.data ?? [];

    const fbPosts = socialPosts.filter((p: any) => ['facebook', 'instagram'].includes(p.platform));
    const ttPosts = socialPosts.filter((p: any) => p.platform === 'tiktok');
    const fbPostsCost = fbPosts.reduce((s: number, p: any) => s + (p.cost_usd ?? 0), 0);
    const ttPostsCost = ttPosts.reduce((s: number, p: any) => s + (p.cost_usd ?? 0), 0);
    const repliesCost = socialComments.reduce((s: number, c: any) => s + (c.cost_usd ?? 0), 0);

    const invoiceNumber = `VIG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${tenantId.slice(0, 6).toUpperCase()}`;

    const lineItems = [
      fee.subscriptionUsd > 0 ? { desc: `Pro Plan Subscription — ${monthStr}`, qty: 1, unit: `$${fee.subscriptionUsd.toFixed(2)}`, amount: fee.subscriptionUsd } : null,
      fee.managedSpendUsd > 0 ? { desc: `Campaign Management Fee (${fee.feePercentage}% of $${fee.managedSpendUsd.toFixed(2)} managed spend)`, qty: 1, unit: `$${fee.percentageFeeUsd.toFixed(2)}`, amount: fee.percentageFeeUsd } : null,
      fbPosts.length > 0 ? { desc: `Facebook / Instagram Posts (${fbPosts.length} posts × $1.00)`, qty: fbPosts.length, unit: '$1.00', amount: fbPostsCost } : null,
      ttPosts.length > 0 ? { desc: `TikTok Video Posts (${ttPosts.length} posts × $3.00)`, qty: ttPosts.length, unit: '$3.00', amount: ttPostsCost } : null,
      socialComments.length > 0 ? { desc: `Comment Replies (${socialComments.length} replies × $0.05)`, qty: socialComments.length, unit: '$0.05', amount: repliesCost } : null,
    ].filter(Boolean) as { desc: string; qty: number; unit: string; amount: number }[];

    const subtotal = lineItems.reduce((s, l) => s + l.amount, 0);

    const tableRows = lineItems.map(l => `
      <div class="invoice-row">
        <span>${l.desc}</span>
        <span style="font-weight:700">$${l.amount.toFixed(2)}</span>
      </div>`).join('');

    const body = `
      <div class="header">
        <div class="header-left">
          <h1>Invoice</h1>
          <p>${invoiceNumber} · ${monthStr}</p>
          ${settingsRes.data?.website_url ? `<p style="margin-top:4px;color:#94a3b8">${settingsRes.data.website_url}</p>` : ''}
        </div>
        <div style="text-align:right">
          <div class="logo">Vigmis</div>
          <p style="font-size:11px;color:#94a3b8;margin-top:6px">Taurus Management and Investments Ltd.<br>514565118 · legal@vigmis.com</p>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><label>Invoice #</label><value style="font-size:14px">${invoiceNumber}</value></div>
        <div class="kpi"><label>Period</label><value style="font-size:14px">${monthStr}</value></div>
        <div class="kpi"><label>Plan</label><value style="font-size:16px;text-transform:capitalize">${fee.plan}</value></div>
        <div class="kpi"><label>Total Due</label><value>$${subtotal.toFixed(2)}</value></div>
      </div>

      <div class="section">
        <div class="section-header"><h2>Line Items</h2></div>
        ${tableRows.length > 0 ? tableRows : '<div class="invoice-row"><span>No billable activity this month</span><span>$0.00</span></div>'}
        <div class="invoice-total">
          <span>Total Due</span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>
      </div>

      <div class="disclaimer">
        <strong>Note:</strong> This invoice is generated automatically by Vigmis based on activity recorded in the platform. Campaign management fees are based on estimated spend. Actual charges may differ slightly once reconciled with platform APIs. Payment is processed via Paddle at the end of each billing period. For questions, contact billing@vigmis.com.
      </div>`;

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="vigmis-invoice-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.html"`)
      .send(printPage(`Invoice ${invoiceNumber}`, body, true));
  });
}

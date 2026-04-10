// GET /analytics/summary?period=7|30|90
// GET /analytics/campaigns
//
// Currently returns mock data modelled on real Google Ads / Meta Ads structure.
// TODO (next week): swap generateMockMetrics() with real API calls once
//   Google Ads Developer Token + Meta Marketing API are approved.

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  // Simple deterministic PRNG so mock data is consistent per session
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDayMetrics(seed: number, budgetUsd: number) {
  const r = (n: number) => seededRandom(seed + n);
  const impressions = Math.round(2500 + r(1) * 3000);
  const ctr = 0.01 + r(2) * 0.035; // 1-4.5%
  const clicks = Math.round(impressions * ctr);
  const spend = parseFloat(Math.min(budgetUsd, budgetUsd * (0.7 + r(3) * 0.6)).toFixed(2));
  const convRate = 0.03 + r(4) * 0.12; // 3-15%
  const conversions = Math.round(clicks * convRate);
  const convValue = parseFloat((conversions * (40 + r(5) * 60)).toFixed(2)); // $40-$100 avg value
  return { impressions, clicks, spend, conversions, convValue };
}

function buildTrend(days: number, budgetPerDay: number, campaignSeed: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split('T')[0];
    const m = generateDayMetrics(campaignSeed + i, budgetPerDay);
    return { date: dateStr, ...m };
  });
}

function aggregateTrend(trend: ReturnType<typeof buildTrend>) {
  return trend.reduce(
    (acc, d) => ({
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      spend: parseFloat((acc.spend + d.spend).toFixed(2)),
      conversions: acc.conversions + d.conversions,
      convValue: parseFloat((acc.convValue + d.convValue).toFixed(2)),
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 },
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /analytics/summary?period=7|30|90
  app.get('/analytics/summary', { preHandler: authenticate }, async (request, reply) => {
    const period = Number((request.query as any).period) || 30;
    const days = [7, 30, 90].includes(period) ? period : 30;

    // Fetch campaigns from DB
    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, platform, name, campaign_type, status, daily_budget_usd')
      .eq('tenant_id', request.tenantId);

    if (!campaigns?.length) {
      return reply.send({
        is_mock: true,
        no_campaigns: true,
        period: days,
        summary: { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0, ctr: 0, cpa: 0, roas: 0 },
        trend: [],
        by_platform: {},
      });
    }

    // Generate mock metrics per campaign
    const platformData: Record<string, { impressions: number; clicks: number; spend: number; conversions: number; convValue: number }> = {};
    const combinedTrend: Record<string, { impressions: number; clicks: number; spend: number; conversions: number; convValue: number }> = {};

    for (const campaign of campaigns) {
      const seed = campaign.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
      const trend = buildTrend(days, campaign.daily_budget_usd ?? 10, seed);
      const totals = aggregateTrend(trend);

      // Per-platform
      if (!platformData[campaign.platform]) {
        platformData[campaign.platform] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
      }
      const p = platformData[campaign.platform];
      p.impressions += totals.impressions;
      p.clicks += totals.clicks;
      p.spend = parseFloat((p.spend + totals.spend).toFixed(2));
      p.conversions += totals.conversions;
      p.convValue = parseFloat((p.convValue + totals.convValue).toFixed(2));

      // Combined trend
      for (const day of trend) {
        if (!combinedTrend[day.date]) {
          combinedTrend[day.date] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
        }
        const t = combinedTrend[day.date];
        t.impressions += day.impressions;
        t.clicks += day.clicks;
        t.spend = parseFloat((t.spend + day.spend).toFixed(2));
        t.conversions += day.conversions;
        t.convValue = parseFloat((t.convValue + day.convValue).toFixed(2));
      }
    }

    // Overall summary
    const allTotals = Object.values(platformData).reduce(
      (acc, p) => ({
        impressions: acc.impressions + p.impressions,
        clicks: acc.clicks + p.clicks,
        spend: parseFloat((acc.spend + p.spend).toFixed(2)),
        conversions: acc.conversions + p.conversions,
        convValue: parseFloat((acc.convValue + p.convValue).toFixed(2)),
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 },
    );

    const summary = {
      ...allTotals,
      ctr: allTotals.impressions ? parseFloat(((allTotals.clicks / allTotals.impressions) * 100).toFixed(2)) : 0,
      cpa: allTotals.conversions ? parseFloat((allTotals.spend / allTotals.conversions).toFixed(2)) : 0,
      roas: allTotals.spend ? parseFloat((allTotals.convValue / allTotals.spend).toFixed(2)) : 0,
    };

    const by_platform = Object.fromEntries(
      Object.entries(platformData).map(([platform, p]) => [
        platform,
        {
          ...p,
          ctr: p.impressions ? parseFloat(((p.clicks / p.impressions) * 100).toFixed(2)) : 0,
          cpa: p.conversions ? parseFloat((p.spend / p.conversions).toFixed(2)) : 0,
          roas: p.spend ? parseFloat((p.convValue / p.spend).toFixed(2)) : 0,
          spend_pct: allTotals.spend ? Math.round((p.spend / allTotals.spend) * 100) : 0,
        },
      ]),
    );

    const trend = Object.entries(combinedTrend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({ date, ...m }));

    return reply.send({
      is_mock: true, // ← swap to false when real API connected
      period: days,
      summary,
      trend,
      by_platform,
      campaigns: campaigns.map(c => {
        const seed = c.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
        const t = aggregateTrend(buildTrend(days, c.daily_budget_usd ?? 10, seed));
        return {
          id: c.id,
          platform: c.platform,
          name: c.name,
          campaign_type: c.campaign_type,
          status: c.status,
          ...t,
          ctr: t.impressions ? parseFloat(((t.clicks / t.impressions) * 100).toFixed(2)) : 0,
          cpa: t.conversions ? parseFloat((t.spend / t.conversions).toFixed(2)) : 0,
          roas: t.spend ? parseFloat((t.convValue / t.spend).toFixed(2)) : 0,
        };
      }),
    });
  });
}

// GET /analytics/summary?period=7|30|90&compare=true
// GET /analytics/daily
//
// Returns mock data modelled on real Google Ads / Meta Ads structure.
// TODO: swap generateDayMetrics() with real API calls once
//   Google Ads Developer Token + Meta Marketing API are approved.

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { forecastBudgetScenarios } from '../services/forecast.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDayMetrics(seed: number, budgetUsd: number) {
  const r = (n: number) => seededRandom(seed + n);
  const impressions = Math.round(2500 + r(1) * 3000);
  const ctr = 0.01 + r(2) * 0.035;
  const clicks = Math.round(impressions * ctr);
  const spend = parseFloat(Math.min(budgetUsd, budgetUsd * (0.7 + r(3) * 0.6)).toFixed(2));
  const convRate = 0.03 + r(4) * 0.12;
  const conversions = Math.round(clicks * convRate);
  const convValue = parseFloat((conversions * (40 + r(5) * 60)).toFixed(2));
  return { impressions, clicks, spend, conversions, convValue };
}

function buildTrend(days: number, budgetPerDay: number, campaignSeed: number, seedOffset = 0) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i) - seedOffset);
    const dateStr = date.toISOString().split('T')[0];
    const m = generateDayMetrics(campaignSeed + i + seedOffset * 1000, budgetPerDay);
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

function computeSummary(totals: { impressions: number; clicks: number; spend: number; conversions: number; convValue: number }) {
  return {
    ...totals,
    ctr: totals.impressions ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
    cpa: totals.conversions ? parseFloat((totals.spend / totals.conversions).toFixed(2)) : 0,
    roas: totals.spend ? parseFloat((totals.convValue / totals.spend).toFixed(2)) : 0,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
}

function computeChanges(curr: ReturnType<typeof computeSummary>, prev: ReturnType<typeof computeSummary>) {
  return {
    spend:       pctChange(curr.spend, prev.spend),
    impressions: pctChange(curr.impressions, prev.impressions),
    clicks:      pctChange(curr.clicks, prev.clicks),
    conversions: pctChange(curr.conversions, prev.conversions),
    convValue:   pctChange(curr.convValue, prev.convValue),
    ctr:         pctChange(curr.ctr, prev.ctr),
    cpa:         pctChange(curr.cpa, prev.cpa),
    roas:        pctChange(curr.roas, prev.roas),
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function analyticsRoutes(app: FastifyInstance) {

  // POST /analytics/event — log a frontend analytics event to analytics_events
  app.post<{ Body: { event: string; metadata?: Record<string, unknown> } }>(
    '/analytics/event',
    { preHandler: authenticate },
    async (request, reply) => {
      const { event, metadata } = request.body ?? {};
      if (!event?.trim()) return reply.code(400).send({ error: 'event required' });

      await db.from('analytics_events').insert({
        tenant_id: request.tenantId,
        event: event.trim(),
        metadata: metadata ?? {},
      });

      return reply.send({ ok: true });
    },
  );

  // GET /analytics/summary?period=7|30|90&compare=true
  app.get('/analytics/summary', { preHandler: authenticate }, async (request, reply) => {
    const { period: periodParam, compare } = request.query as any;
    const days = [7, 30, 90].includes(Number(periodParam)) ? Number(periodParam) : 30;
    const withCompare = compare === 'true' || compare === '1';

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
        campaigns: [],
      });
    }

    const platformCurr: Record<string, any> = {};
    const platformPrev: Record<string, any> = {};
    const combinedTrendCurr: Record<string, any> = {};

    for (const campaign of campaigns) {
      const seed = campaign.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
      const trendCurr = buildTrend(days, campaign.daily_budget_usd ?? 10, seed, 0);
      const trendPrev = buildTrend(days, campaign.daily_budget_usd ?? 10, seed, days);
      const totalsCurr = aggregateTrend(trendCurr);
      const totalsPrev = aggregateTrend(trendPrev);

      const platforms = ['google', 'meta', 'tiktok'];
      for (const pGroup of [{ map: platformCurr, totals: totalsCurr }, { map: platformPrev, totals: totalsPrev }]) {
        if (!pGroup.map[campaign.platform]) {
          pGroup.map[campaign.platform] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
        }
        const p = pGroup.map[campaign.platform];
        p.impressions += pGroup.totals.impressions;
        p.clicks += pGroup.totals.clicks;
        p.spend = parseFloat((p.spend + pGroup.totals.spend).toFixed(2));
        p.conversions += pGroup.totals.conversions;
        p.convValue = parseFloat((p.convValue + pGroup.totals.convValue).toFixed(2));
      }

      for (const day of trendCurr) {
        if (!combinedTrendCurr[day.date]) {
          combinedTrendCurr[day.date] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
        }
        const t = combinedTrendCurr[day.date];
        t.impressions += day.impressions;
        t.clicks += day.clicks;
        t.spend = parseFloat((t.spend + day.spend).toFixed(2));
        t.conversions += day.conversions;
        t.convValue = parseFloat((t.convValue + day.convValue).toFixed(2));
      }
    }

    // Overall summaries
    const overallCurr = Object.values(platformCurr).reduce(
      (acc: any, p: any) => ({
        impressions: acc.impressions + p.impressions,
        clicks: acc.clicks + p.clicks,
        spend: parseFloat((acc.spend + p.spend).toFixed(2)),
        conversions: acc.conversions + p.conversions,
        convValue: parseFloat((acc.convValue + p.convValue).toFixed(2)),
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 },
    );
    const overallPrev = Object.values(platformPrev).reduce(
      (acc: any, p: any) => ({
        impressions: acc.impressions + p.impressions,
        clicks: acc.clicks + p.clicks,
        spend: parseFloat((acc.spend + p.spend).toFixed(2)),
        conversions: acc.conversions + p.conversions,
        convValue: parseFloat((acc.convValue + p.convValue).toFixed(2)),
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 },
    );

    const summary = computeSummary(overallCurr);
    const previousSummary = computeSummary(overallPrev);

    const by_platform = Object.fromEntries(
      Object.entries(platformCurr).map(([platform, p]) => {
        const prev = platformPrev[platform] ?? { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
        const curr = computeSummary(p as any);
        const prevS = computeSummary(prev);
        return [
          platform,
          {
            ...curr,
            spend_pct: overallCurr.spend ? Math.round((p.spend / overallCurr.spend) * 100) : 0,
            changes: withCompare ? computeChanges(curr, prevS) : undefined,
          },
        ];
      }),
    );

    const trend = Object.entries(combinedTrendCurr)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({ date, ...m as any }));

    // Top / bottom campaigns by ROAS
    const campaignMetrics = campaigns.map(c => {
      const seed = c.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
      const t = aggregateTrend(buildTrend(days, c.daily_budget_usd ?? 10, seed));
      const prev = aggregateTrend(buildTrend(days, c.daily_budget_usd ?? 10, seed, days));
      const curr = computeSummary(t);
      const prevS = computeSummary(prev);
      return {
        id: c.id, platform: c.platform, name: c.name,
        campaign_type: c.campaign_type, status: c.status,
        ...curr,
        changes: withCompare ? computeChanges(curr, prevS) : undefined,
      };
    });

    const active = campaignMetrics.filter(c => c.status === 'active');
    const sorted = [...active].sort((a, b) => b.roas - a.roas);

    // True ROAS from conversion_events (real data if pixel is installed)
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const [purchaseEventsRes, settingsRes] = await Promise.all([
      db.from('conversion_events')
        .select('value, currency')
        .eq('tenant_id', request.tenantId)
        .eq('event_type', 'purchase')
        .gte('created_at', since),
      db.from('client_settings')
        .select('margin_pct, business_type, shopify_domain')
        .eq('tenant_id', request.tenantId)
        .maybeSingle(),
    ]);

    const purchases = purchaseEventsRes.data ?? [];
    const marginPct = settingsRes.data?.margin_pct ?? null;
    const revenueTracked = purchases.reduce((s, e) => s + (e.value ?? 0), 0);
    const trueRoas = summary.spend > 0 && revenueTracked > 0
      ? parseFloat((revenueTracked / summary.spend).toFixed(2))
      : null;
    const trueProfit = marginPct && summary.spend > 0 && revenueTracked > 0
      ? parseFloat((revenueTracked * (marginPct / 100) - summary.spend).toFixed(2))
      : null;

    return reply.send({
      is_mock: true,
      period: days,
      summary,
      previous_summary: withCompare ? previousSummary : undefined,
      changes: withCompare ? computeChanges(summary, previousSummary) : undefined,
      trend,
      by_platform,
      campaigns: campaignMetrics,
      top_performers: sorted.slice(0, 3),
      bottom_performers: sorted.slice(-3).reverse(),
      conversion_intelligence: {
        platform_roas:       summary.roas,
        true_roas:           trueRoas,
        true_profit:         trueProfit,
        revenue_tracked:     parseFloat(revenueTracked.toFixed(2)),
        conversions_tracked: purchases.length,
        margin_pct:          marginPct,
        data_source:         settingsRes.data?.shopify_domain ? 'shopify' : purchases.length > 0 ? 'pixel' : 'none',
      },
    });
  });

  // GET /analytics/budget-forecast?budget=<number>
  app.get('/analytics/budget-forecast', { preHandler: authenticate }, async (request, reply) => {
    const { budget } = request.query as { budget?: string };
    const budgetUsd = budget ? parseFloat(budget) : 0;

    if (!budgetUsd || isNaN(budgetUsd) || budgetUsd <= 0) {
      return reply.code(400).send({ error: 'budget query param must be a positive number' });
    }

    const result = await forecastBudgetScenarios(request.tenantId, budgetUsd);
    return reply.send(result);
  });

  // GET /analytics/daily — today vs yesterday for live overview
  app.get('/analytics/daily', { preHandler: authenticate }, async (request, reply) => {
    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, platform, name, status, daily_budget_usd')
      .eq('tenant_id', request.tenantId)
      .in('status', ['active', 'paused']);

    const totalDailyBudget = (campaigns ?? []).reduce((s: number, c: any) => s + (c.daily_budget_usd ?? 0), 0);
    const activeCampaigns = (campaigns ?? []).filter((c: any) => c.status === 'active');

    if (!campaigns?.length) {
      return reply.send({
        is_mock: true,
        today: { spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0, ctr: 0, roas: 0 },
        yesterday: { spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0, ctr: 0, roas: 0 },
        changes: {},
        daily_budget: 0,
        active_campaigns: 0,
        pacing: { status: 'on_track', pct_elapsed: 0, pct_spent: 0 },
      });
    }

    let todayTotals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };
    let yesterdayTotals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, convValue: 0 };

    for (const campaign of campaigns) {
      const seed = campaign.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
      const today = generateDayMetrics(seed + 9999, campaign.daily_budget_usd ?? 10);
      const yesterday = generateDayMetrics(seed + 9998, campaign.daily_budget_usd ?? 10);

      todayTotals.impressions += today.impressions;
      todayTotals.clicks += today.clicks;
      todayTotals.spend = parseFloat((todayTotals.spend + today.spend).toFixed(2));
      todayTotals.conversions += today.conversions;
      todayTotals.convValue = parseFloat((todayTotals.convValue + today.convValue).toFixed(2));

      yesterdayTotals.impressions += yesterday.impressions;
      yesterdayTotals.clicks += yesterday.clicks;
      yesterdayTotals.spend = parseFloat((yesterdayTotals.spend + yesterday.spend).toFixed(2));
      yesterdayTotals.conversions += yesterday.conversions;
      yesterdayTotals.convValue = parseFloat((yesterdayTotals.convValue + yesterday.convValue).toFixed(2));
    }

    const todayS = computeSummary(todayTotals);
    const yesterdayS = computeSummary(yesterdayTotals);

    // Burn rate pacing
    const now = new Date();
    const hoursElapsed = now.getHours() + now.getMinutes() / 60;
    const pctElapsed = parseFloat((hoursElapsed / 24 * 100).toFixed(1));
    const pctSpent = totalDailyBudget > 0 ? parseFloat((todayS.spend / totalDailyBudget * 100).toFixed(1)) : 0;
    const diff = pctSpent - pctElapsed;
    const pacing = {
      status: diff > 15 ? 'overspending' : diff < -20 ? 'underspending' : 'on_track' as 'on_track' | 'overspending' | 'underspending',
      pct_elapsed: pctElapsed,
      pct_spent: pctSpent,
      spend_today: todayS.spend,
      budget_today: totalDailyBudget,
    };

    // Recent optimization actions (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentActions } = await db
      .from('audit_log')
      .select('action, created_at, payload')
      .eq('tenant_id', request.tenantId)
      .gte('created_at', since)
      .like('action', 'optimization.%')
      .not('action', 'eq', 'optimization.metrics_snapshot')
      .order('created_at', { ascending: false })
      .limit(8);

    // Platform health
    const platformHealth: Record<string, any> = {};
    for (const c of campaigns) {
      if (!platformHealth[c.platform]) {
        platformHealth[c.platform] = { active: 0, paused: 0, error: 0 };
      }
      platformHealth[c.platform][c.status === 'active' ? 'active' : c.status === 'paused' ? 'paused' : 'error']++;
    }

    return reply.send({
      is_mock: true,
      today: todayS,
      yesterday: yesterdayS,
      changes: computeChanges(todayS, yesterdayS),
      daily_budget: totalDailyBudget,
      active_campaigns: activeCampaigns.length,
      pacing,
      platform_health: platformHealth,
      recent_actions: (recentActions ?? []).map((a: any) => ({
        action: a.action.replace('optimization.', ''),
        created_at: a.created_at,
        campaign: a.payload?.campaign_name ?? a.payload?.campaignId ?? null,
        detail: a.payload?.reason ?? a.payload?.action ?? null,
      })),
    });
  });
}

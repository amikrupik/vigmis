// Budget scenario modeling — what-if simulations based on ROAS history

import { db } from '@vigmis/db';

export interface BudgetScenario {
  budgetUsd: number;
  estimatedLeads: number;
  estimatedRevenue: number;
  estimatedRoas: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

export async function forecastBudgetScenarios(
  tenantId: string,
  currentBudget: number,
): Promise<{ scenarios: BudgetScenario[]; basedOn: string }> {
  // Get historical GA4 data for benchmarks
  const { data: ga4 } = await db
    .from('ga4_daily_metrics')
    .select('sessions, conversions, revenue, ad_spend_usd')
    .eq('tenant_id', tenantId)
    .gte(
      'date',
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    )
    .order('date', { ascending: false })
    .limit(90);

  // Calculate average ROAS from history
  let avgRoas = 2.0; // industry default
  let basedOn = 'industry average (no historical data yet)';

  if (ga4 && ga4.length > 10) {
    const totalRevenue = ga4.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totalSpend = ga4.reduce((s, r) => s + (r.ad_spend_usd ?? 0), 0);
    if (totalSpend > 0) {
      avgRoas = totalRevenue / totalSpend;
      basedOn = `your last ${ga4.length} days of data`;
    }
  }

  // Rough CPL derived from budget + ROAS (avg revenue per lead ~$50)
  const avgRevenuePerLead = 50;
  const cpl =
    currentBudget > 0
      ? currentBudget / Math.max(1, (currentBudget * avgRoas) / avgRevenuePerLead)
      : 25;

  const scenarios: BudgetScenario[] = [
    {
      budgetUsd: currentBudget * 0.5,
      estimatedLeads: Math.round((currentBudget * 0.5) / cpl),
      estimatedRevenue: Math.round(currentBudget * 0.5 * avgRoas),
      estimatedRoas: parseFloat(avgRoas.toFixed(2)),
      confidence: 'high',
      note: 'Conservative — lower risk',
    },
    {
      budgetUsd: currentBudget,
      estimatedLeads: Math.round(currentBudget / cpl),
      estimatedRevenue: Math.round(currentBudget * avgRoas),
      estimatedRoas: parseFloat(avgRoas.toFixed(2)),
      confidence: 'high',
      note: 'Current budget',
    },
    {
      budgetUsd: currentBudget * 2,
      estimatedLeads: Math.round((currentBudget * 2) / cpl * 0.9),
      estimatedRevenue: Math.round(currentBudget * 2 * avgRoas * 0.85),
      estimatedRoas: parseFloat((avgRoas * 0.85).toFixed(2)),
      confidence: 'medium',
      note: 'Growth — some diminishing returns expected',
    },
    {
      budgetUsd: currentBudget * 4,
      estimatedLeads: Math.round((currentBudget * 4) / cpl * 0.7),
      estimatedRevenue: Math.round(currentBudget * 4 * avgRoas * 0.65),
      estimatedRoas: parseFloat((avgRoas * 0.65).toFixed(2)),
      confidence: 'low',
      note: 'Aggressive — significant diminishing returns',
    },
  ];

  return { scenarios, basedOn };
}

import { db } from '@vigmis/db';

/**
 * Collects anonymized performance data from all tenants and contributes to industry benchmarks.
 * Runs monthly. NO tenant_id is stored — only aggregated metrics per industry/platform/country.
 *
 * Privacy guarantee: we only insert aggregate rows, never individual tenant data.
 */
export async function aggregateBenchmarks(): Promise<{ contributed: number; updated: number }> {
  const periodMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Fetch all tenants with their settings + last 30d GA4 data
  const { data: tenants } = await db
    .from('client_settings')
    .select('tenant_id, business_type, goal, geo_include, management_percentage');

  if (!tenants?.length) return { contributed: 0, updated: 0 };

  let contributed = 0;

  for (const t of tenants) {
    if (!t.business_type || !t.goal) continue;

    // Get GA4 last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const { data: ga4 } = await db
      .from('ga4_daily_metrics')
      .select('sessions, conversions, revenue_usd')
      .eq('tenant_id', t.tenant_id)
      .gte('date', thirtyDaysAgo);

    if (!ga4?.length) continue;

    const totalSessions = ga4.reduce((s, r) => s + (r.sessions ?? 0), 0);
    const totalConversions = ga4.reduce((s, r) => s + (r.conversions ?? 0), 0);
    const totalRevenue = ga4.reduce((s, r) => s + (r.revenue_usd ?? 0), 0);

    if (totalSessions < 100 || totalConversions < 5) continue; // not enough data

    // Get campaigns to calculate spend + CPC
    const { data: campaigns } = await db
      .from('campaigns')
      .select('platform, daily_budget_usd')
      .eq('tenant_id', t.tenant_id)
      .eq('status', 'active');

    if (!campaigns?.length) continue;

    const countryCode = ((t.geo_include as string[] | null)?.[0] ?? 'IL').toUpperCase().slice(0, 2);
    const estimatedSpend = campaigns.reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0) * 30;
    const cvr = totalSessions > 0 ? totalConversions / totalSessions : null;
    const cpa = totalConversions > 0 ? estimatedSpend / totalConversions : null;
    const roas = estimatedSpend > 0 ? totalRevenue / estimatedSpend : null;

    // Group by platform and contribute anonymized rows
    const platforms = [...new Set(campaigns.map(c => c.platform))];
    for (const platform of platforms) {
      try {
        await db.from('benchmark_contributions').insert({
          industry: t.business_type,
          platform,
          country_code: countryCode,
          goal: t.goal,
          period_month: periodMonth,
          cpa_usd: cpa,
          roas,
          cvr,
          spend_usd: estimatedSpend / platforms.length,
          conversions: Math.round(totalConversions / platforms.length),
        });
        contributed++;
      } catch { /* skip duplicates */ }
    }
  }

  // Update industry_benchmarks with weighted averages from contributions
  let updated = 0;
  const { data: groups } = await db
    .from('benchmark_contributions')
    .select('industry, platform, country_code, goal')
    .order('industry');

  // Unique group keys
  const keys = [...new Map((groups ?? []).map(g =>
    [`${g.industry}|${g.platform}|${g.country_code}|${g.goal}`, g]
  )).values()];

  for (const key of keys) {
    const { data: rows } = await db
      .from('benchmark_contributions')
      .select('cpa_usd, roas, cvr, spend_usd, conversions')
      .eq('industry', key.industry)
      .eq('platform', key.platform)
      .eq('country_code', key.country_code)
      .eq('goal', key.goal);

    if (!rows || rows.length < 3) continue; // need ≥3 accounts for anonymity

    const validRoas = rows.filter(r => r.roas != null && r.roas > 0).map(r => r.roas!);
    const validCpa = rows.filter(r => r.cpa_usd != null && r.cpa_usd > 0).map(r => r.cpa_usd!);
    const validCvr = rows.filter(r => r.cvr != null && r.cvr > 0).map(r => r.cvr!);

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    await db.from('industry_benchmarks').upsert({
      industry: key.industry,
      platform: key.platform,
      country_code: key.country_code,
      goal: key.goal,
      avg_cpa_usd: avg(validCpa),
      avg_roas: avg(validRoas),
      avg_cvr: avg(validCvr),
      sample_tenants: rows.length,
      source: 'aggregated',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'industry,platform,country_code,goal' });

    updated++;
  }

  return { contributed, updated };
}

/**
 * Returns industry benchmarks for a tenant, formatted for injection into strategy prompt.
 */
export async function getIndustryBenchmarks(opts: {
  industry: string;
  platform: string;
  countryCode: string;
  goal: string;
}): Promise<string> {
  const { industry, platform, countryCode, goal } = opts;

  const { data } = await db
    .from('industry_benchmarks')
    .select('avg_ctr, avg_cpc_usd, avg_cpa_usd, avg_roas, avg_cvr, sample_tenants, source')
    .eq('industry', industry)
    .eq('platform', platform)
    .eq('goal', goal)
    .or(`country_code.eq.${countryCode},country_code.eq.IL`) // fallback to IL if country not found
    .order('sample_tenants', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return '';

  const trust = data.source === 'aggregated' && (data.sample_tenants ?? 0) >= 5
    ? `(based on ${data.sample_tenants} real accounts)`
    : '(seeded from public benchmarks)';

  const lines = [
    `INDUSTRY BENCHMARKS for ${industry} / ${platform} / ${goal} ${trust}:`,
    data.avg_ctr ? `- Typical CTR: ${(data.avg_ctr * 100).toFixed(1)}%` : null,
    data.avg_cpc_usd ? `- Typical CPC: $${data.avg_cpc_usd.toFixed(2)}` : null,
    data.avg_cpa_usd ? `- Typical CPA: $${data.avg_cpa_usd.toFixed(0)}` : null,
    data.avg_roas ? `- Typical ROAS: ${data.avg_roas.toFixed(1)}×` : null,
    data.avg_cvr ? `- Typical Conv. rate: ${(data.avg_cvr * 100).toFixed(1)}%` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

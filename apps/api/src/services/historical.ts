// Fetch historical campaign data from connected ad platforms
// Called after OAuth connection and cached in platform_tokens.historical_data
// Gracefully returns null if token is missing or API is not yet approved

import { db, decryptToken } from '@vigmis/db';

export interface PlatformHistoricalData {
  campaigns: Array<{
    name: string;
    status: string;
    type?: string;
    daily_budget?: number;
  }>;
  keywords?: Array<{ text: string; impressions: number; clicks: number; cpc?: number }>;
  metrics_30d: {
    impressions: number;
    clicks: number;
    spend_usd: number;
    conversions: number;
    ctr: number;
    avg_cpc_usd: number;
    roas?: number;
  };
  top_audiences?: string[];
  fetched_at: string;
}

export interface AllHistoricalData {
  google?: PlatformHistoricalData | null;
  meta?: PlatformHistoricalData | null;
  tiktok?: PlatformHistoricalData | null;
}

// ── Google ────────────────────────────────────────────────────────────────────

async function fetchGoogleHistory(tenantId: string): Promise<PlatformHistoricalData | null> {
  try {
    const { data: row } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'google')
      .maybeSingle();
    if (!row?.access_token) return null;

    const token = decryptToken(row.access_token);
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) return null;

    // List accessible customer accounts
    const accountsRes = await fetch(
      'https://googleads.googleapis.com/v21/customers:listAccessibleCustomers',
      {
        headers: { Authorization: `Bearer ${token}`, 'developer-token': devToken },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!accountsRes.ok) return null;

    const accounts = await accountsRes.json();
    const customerId = accounts.resourceNames?.[0]?.split('/')[1];
    if (!customerId) return null;

    const headers = {
      Authorization: `Bearer ${token}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    };

    // Campaign metrics last 30 days
    const [campaignRes, kwRes] = await Promise.all([
      fetch(`https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `SELECT campaign.name, campaign.status, campaign.advertising_channel_type,
                  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
                  FROM campaign
                  WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
                  ORDER BY metrics.impressions DESC LIMIT 20`,
        }),
        signal: AbortSignal.timeout(15000),
      }),
      fetch(`https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
                  metrics.impressions, metrics.clicks, metrics.cost_micros
                  FROM keyword_view
                  WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
                  ORDER BY metrics.impressions DESC LIMIT 20`,
        }),
        signal: AbortSignal.timeout(15000),
      }),
    ]);

    if (!campaignRes.ok) return null;
    const campaignData = await campaignRes.json();
    const kwData = kwRes.ok ? await kwRes.json() : { results: [] };

    let totalImpressions = 0, totalClicks = 0, totalCostMicros = 0, totalConversions = 0;
    const campaigns = (campaignData.results ?? []).map((r: any) => {
      totalImpressions += r.metrics?.impressions ?? 0;
      totalClicks += r.metrics?.clicks ?? 0;
      totalCostMicros += r.metrics?.cost_micros ?? 0;
      totalConversions += r.metrics?.conversions ?? 0;
      return {
        name: r.campaign?.name,
        status: r.campaign?.status,
        type: r.campaign?.advertising_channel_type,
      };
    });

    const spendUsd = totalCostMicros / 1_000_000;
    const keywords = (kwData.results ?? []).map((r: any) => ({
      text: r.ad_group_criterion?.keyword?.text,
      impressions: r.metrics?.impressions ?? 0,
      clicks: r.metrics?.clicks ?? 0,
      cpc: r.metrics?.cost_micros ? r.metrics.cost_micros / 1_000_000 / Math.max(r.metrics.clicks, 1) : 0,
    }));

    return {
      campaigns,
      keywords,
      metrics_30d: {
        impressions: totalImpressions,
        clicks: totalClicks,
        spend_usd: Math.round(spendUsd * 100) / 100,
        conversions: Math.round(totalConversions),
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        avg_cpc_usd: totalClicks > 0 ? Math.round((spendUsd / totalClicks) * 100) / 100 : 0,
      },
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Meta ──────────────────────────────────────────────────────────────────────

async function fetchMetaHistory(tenantId: string): Promise<PlatformHistoricalData | null> {
  try {
    const { data: row } = await db
      .from('platform_tokens')
      .select('access_token')
      .eq('tenant_id', tenantId)
      .eq('platform', 'meta')
      .maybeSingle();
    if (!row?.access_token) return null;

    const token = decryptToken(row.access_token);
    const base = 'https://graph.facebook.com/v19.0';

    // Get primary ad account
    const accountsRes = await fetch(
      `${base}/me/adaccounts?fields=name,account_id,currency&limit=5&access_token=${token}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!accountsRes.ok) return null;
    const accountsData = await accountsRes.json();
    const accountId = accountsData.data?.[0]?.id;
    if (!accountId) return null;

    // Campaigns + insights in parallel
    const [campaignsRes, insightsRes, adsetsRes] = await Promise.all([
      fetch(
        `${base}/${accountId}/campaigns?fields=name,status,objective,daily_budget&limit=20&access_token=${token}`,
        { signal: AbortSignal.timeout(10000) },
      ),
      fetch(
        `${base}/${accountId}/insights?fields=impressions,clicks,spend,reach,ctr,cpc,actions,purchase_roas&date_preset=last_30_days&access_token=${token}`,
        { signal: AbortSignal.timeout(10000) },
      ),
      fetch(
        `${base}/${accountId}/adsets?fields=name,targeting&limit=10&access_token=${token}`,
        { signal: AbortSignal.timeout(10000) },
      ),
    ]);

    const campaignsData = campaignsRes.ok ? await campaignsRes.json() : { data: [] };
    const insightsData = insightsRes.ok ? await insightsRes.json() : { data: [] };
    const adsetsData = adsetsRes.ok ? await adsetsRes.json() : { data: [] };

    const campaigns = (campaignsData.data ?? []).map((c: any) => ({
      name: c.name,
      status: c.status,
      type: c.objective,
      daily_budget: c.daily_budget ? parseInt(c.daily_budget) / 100 : 0,
    }));

    const ins = insightsData.data?.[0] ?? {};
    const conversions = parseInt(
      (ins.actions ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? '0',
    );
    const roas = parseFloat(
      (ins.purchase_roas ?? []).find((r: any) => r.action_type === 'omni_purchase')?.value ?? '0',
    );

    const topAudiences: string[] = (adsetsData.data ?? [])
      .map((s: any) => s.name)
      .filter(Boolean)
      .slice(0, 5);

    return {
      campaigns,
      top_audiences: topAudiences,
      metrics_30d: {
        impressions: parseInt(ins.impressions ?? '0'),
        clicks: parseInt(ins.clicks ?? '0'),
        spend_usd: parseFloat(ins.spend ?? '0'),
        conversions,
        ctr: parseFloat(ins.ctr ?? '0'),
        avg_cpc_usd: parseFloat(ins.cpc ?? '0'),
        roas,
      },
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function fetchTikTokHistory(tenantId: string): Promise<PlatformHistoricalData | null> {
  try {
    const { data: row } = await db
      .from('platform_tokens')
      .select('access_token, account_id')
      .eq('tenant_id', tenantId)
      .eq('platform', 'tiktok')
      .maybeSingle();
    if (!row?.access_token || !row?.account_id) return null;

    const token = decryptToken(row.access_token);
    const advertiserId = row.account_id;
    const base = 'https://business-api.tiktok.com/open_api/v1.3';

    const campaignsRes = await fetch(
      `${base}/campaign/get/?advertiser_id=${advertiserId}&fields=["campaign_id","campaign_name","status","objective_type","budget"]&page_size=20`,
      { headers: { 'Access-Token': token }, signal: AbortSignal.timeout(10000) },
    );
    if (!campaignsRes.ok) return null;

    const campaignsData = await campaignsRes.json();
    const campaigns = (campaignsData.data?.list ?? []).map((c: any) => ({
      name: c.campaign_name,
      status: c.status,
      type: c.objective_type,
      daily_budget: c.budget ?? 0,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const insightsRes = await fetch(`${base}/report/integrated/get/`, {
      method: 'POST',
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_ADVERTISER',
        dimensions: [],
        metrics: ['impressions', 'clicks', 'spend', 'conversions', 'ctr', 'cost_per_click'],
        start_date: start,
        end_date: today,
        page_size: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const insightsData = insightsRes.ok ? await insightsRes.json() : { data: { list: [] } };
    const ins = insightsData.data?.list?.[0]?.metrics ?? {};

    return {
      campaigns,
      metrics_30d: {
        impressions: ins.impressions ?? 0,
        clicks: ins.clicks ?? 0,
        spend_usd: ins.spend ?? 0,
        conversions: ins.conversions ?? 0,
        ctr: ins.ctr ?? 0,
        avg_cpc_usd: ins.cost_per_click ?? 0,
      },
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchAndStoreHistoricalData(
  tenantId: string,
  platform: 'google' | 'meta' | 'tiktok',
): Promise<void> {
  let data: PlatformHistoricalData | null = null;

  if (platform === 'google') data = await fetchGoogleHistory(tenantId);
  else if (platform === 'meta') data = await fetchMetaHistory(tenantId);
  else if (platform === 'tiktok') data = await fetchTikTokHistory(tenantId);

  if (!data) return;

  await db
    .from('platform_tokens')
    .update({ historical_data: data })
    .eq('tenant_id', tenantId)
    .eq('platform', platform);
}

export async function getAllHistoricalData(tenantId: string): Promise<AllHistoricalData> {
  const { data: rows } = await db
    .from('platform_tokens')
    .select('platform, historical_data')
    .eq('tenant_id', tenantId);

  const result: AllHistoricalData = {};
  for (const row of rows ?? []) {
    if (row.historical_data) {
      result[row.platform as keyof AllHistoricalData] = row.historical_data as PlatformHistoricalData;
    }
  }
  return result;
}

// ── Facebook Ad Library — competitor ads ─────────────────────────────────────

export async function fetchCompetitorAds(
  websiteUrl: string,
  geoInclude: string[],
  metaToken?: string,
): Promise<string> {
  if (!metaToken) return '';
  try {
    // Derive keyword from domain
    let keyword = '';
    try {
      keyword = new URL(websiteUrl).hostname.replace('www.', '').split('.')[0];
    } catch {
      return '';
    }
    if (!keyword || keyword.length < 2) return '';

    // Map first geo to approximate 2-letter country code
    const geoMap: Record<string, string> = {
      israel: 'IL', 'tel aviv': 'IL', jerusalem: 'IL', haifa: 'IL',
      'united states': 'US', usa: 'US', 'new york': 'US', california: 'US',
      'united kingdom': 'GB', uk: 'GB', london: 'GB',
      germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
      australia: 'AU', canada: 'CA', brazil: 'BR', india: 'IN',
    };
    const geoKey = (geoInclude[0] ?? '').toLowerCase();
    const country = geoMap[geoKey] ?? 'US';

    const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
    url.searchParams.set('search_terms', keyword);
    url.searchParams.set('ad_reached_countries', `["${country}"]`);
    url.searchParams.set('fields', 'ad_creative_bodies,ad_creative_link_titles,page_name,ad_delivery_start_time');
    url.searchParams.set('limit', '10');
    url.searchParams.set('access_token', metaToken);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';

    const data = await res.json();
    const ads: any[] = data.data ?? [];
    if (ads.length === 0) return '';

    return ads
      .slice(0, 6)
      .map((ad: any) => {
        const page = ad.page_name ?? 'Unknown competitor';
        const title = ad.ad_creative_link_titles?.[0] ?? '';
        const body = ad.ad_creative_bodies?.[0] ?? '';
        return `• ${page}: "${title}" — ${body}`.slice(0, 250);
      })
      .join('\n');
  } catch {
    return '';
  }
}

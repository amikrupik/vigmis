// GA4 (Google Analytics 4) connector
// Reuses the existing Google OAuth token (platform_tokens.platform = 'google')
// — we just add the analytics.readonly scope to the scope list at first connect,
// or upgrade via re-consent. The Data API + Admin API both accept this token.

import { db, decryptToken } from '@vigmis/db';

const ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

async function getGoogleToken(tenantId: string): Promise<string | null> {
  const { data } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'google')
    .maybeSingle();
  if (!data?.access_token) return null;
  return decryptToken(data.access_token);
}

export interface GA4Property {
  property_id: string;       // "properties/123456789"
  display_name: string;
  account_id?: string;
  currency?: string;
  time_zone?: string;
}

export async function listGa4Properties(tenantId: string): Promise<GA4Property[]> {
  const token = await getGoogleToken(tenantId);
  if (!token) return [];

  // Step 1: list account summaries (includes nested property summaries)
  const res = await fetch(`${ADMIN_BASE}/accountSummaries?pageSize=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = await res.json() as {
    accountSummaries?: Array<{
      account: string;
      displayName: string;
      propertySummaries?: Array<{ property: string; displayName: string }>;
    }>;
  };

  const props: GA4Property[] = [];
  for (const acc of json.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      props.push({
        property_id: p.property,
        display_name: `${acc.displayName} / ${p.displayName}`,
        account_id: acc.account,
      });
    }
  }
  return props;
}

export interface GA4DailyRow {
  date: string;            // YYYY-MM-DD
  source: string;
  medium: string;
  session_campaign: string;
  sessions: number;
  active_users: number;
  conversions: number;
  purchase_revenue: number;
  // New (Session 4.4) — incrementality split
  new_users: number;
  returning_users: number;
  first_time_purchasers: number;
  first_purchase_revenue: number;
}

// Pull yesterday's acquisition-by-campaign report.
// Two GA4 calls — first the aggregate, then the newVsReturning split.
// We merge them in-memory; storing only one row per (date,source,medium,campaign).
export async function fetchGa4DailyAcquisition(
  tenantId: string,
  propertyId: string,
  daysBack = 1,
): Promise<GA4DailyRow[]> {
  const token = await getGoogleToken(tenantId);
  if (!token) return [];

  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysBack - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const dateRange = { dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }] };

  // Call 1: aggregate metrics (existing behavior)
  const aggBody = {
    ...dateRange,
    dimensions: [
      { name: 'date' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignName' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'purchaseRevenue' },
      { name: 'firstTimePurchasers' },
    ],
    limit: 2000,
  };

  // Call 2: new vs returning split (separate report because adding the
  // newVsReturning dimension changes the row cardinality)
  const splitBody = {
    ...dateRange,
    dimensions: [
      { name: 'date' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignName' },
      { name: 'newVsReturning' },
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'purchaseRevenue' },
    ],
    limit: 4000,
  };

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const [aggRes, splitRes] = await Promise.all([
    fetch(`${DATA_BASE}/${propertyId}:runReport`, { method: 'POST', headers, body: JSON.stringify(aggBody) }),
    fetch(`${DATA_BASE}/${propertyId}:runReport`, { method: 'POST', headers, body: JSON.stringify(splitBody) }),
  ]);

  if (!aggRes.ok) return [];

  const aggJson = await aggRes.json() as {
    rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
  };

  const splitJson = splitRes.ok
    ? (await splitRes.json() as {
        rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
      })
    : { rows: [] };

  // Map of "date|source|medium|campaign" → { new_users, returning_users, first_purchase_revenue }
  const splitMap = new Map<string, { new_users: number; returning_users: number; first_purchase_revenue: number }>();
  for (const r of splitJson.rows ?? []) {
    const [d, source, medium, campaign, nvr] = r.dimensionValues.map(v => v.value);
    const [activeUsers, revenue] = r.metricValues.map(v => Number(v.value ?? 0));
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const key = `${date}|${source || '(direct)'}|${medium || '(none)'}|${campaign || '(not set)'}`;
    const existing = splitMap.get(key) ?? { new_users: 0, returning_users: 0, first_purchase_revenue: 0 };
    if (nvr === 'new') {
      existing.new_users += Math.round(activeUsers);
      existing.first_purchase_revenue += revenue;
    } else if (nvr === 'returning') {
      existing.returning_users += Math.round(activeUsers);
    }
    splitMap.set(key, existing);
  }

  return (aggJson.rows ?? []).map(r => {
    const [d, source, medium, campaign] = r.dimensionValues.map(v => v.value);
    const [sessions, active_users, conversions, purchase_revenue, first_time_purchasers] = r.metricValues.map(v => Number(v.value ?? 0));
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const key = `${date}|${source || '(direct)'}|${medium || '(none)'}|${campaign || '(not set)'}`;
    const split = splitMap.get(key) ?? { new_users: 0, returning_users: 0, first_purchase_revenue: 0 };
    return {
      date,
      source: source || '(direct)',
      medium: medium || '(none)',
      session_campaign: campaign || '(not set)',
      sessions: Math.round(sessions),
      active_users: Math.round(active_users),
      conversions,
      purchase_revenue,
      new_users: split.new_users,
      returning_users: split.returning_users,
      first_time_purchasers: Math.round(first_time_purchasers),
      first_purchase_revenue: split.first_purchase_revenue,
    };
  });
}

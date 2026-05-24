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
}

// Pull yesterday's acquisition-by-campaign report.
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

  // propertyId is "properties/123456789"; runReport expects it in the URL path
  const res = await fetch(`${DATA_BASE}/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
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
      ],
      limit: 2000,
    }),
  });

  if (!res.ok) return [];
  const json = await res.json() as {
    rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
  };

  return (json.rows ?? []).map(r => {
    const [d, source, medium, campaign] = r.dimensionValues.map(v => v.value);
    const [sessions, active_users, conversions, purchase_revenue] = r.metricValues.map(v => Number(v.value ?? 0));
    return {
      // GA4 returns date as YYYYMMDD
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      source: source || '(direct)',
      medium: medium || '(none)',
      session_campaign: campaign || '(not set)',
      sessions: Math.round(sessions),
      active_users: Math.round(active_users),
      conversions,
      purchase_revenue,
    };
  });
}

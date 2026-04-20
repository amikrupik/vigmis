// Meta Marketing API — Ad Set operations for A/B testing
// Each A/B test creates two sibling Ad Sets under the same campaign.
// Insights are fetched per Ad Set so we can compare creative variants directly.

import { db, decryptToken } from '@vigmis/db';

const META_API_VERSION = 'v19.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function getMetaCredentials(tenantId: string): Promise<{ accessToken: string; adAccountId: string }> {
  const { data } = await db
    .from('platform_tokens')
    .select('access_token, account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .single();

  if (!data) throw new Error(`No Meta token for tenant ${tenantId}`);
  const accessToken = decryptToken(data.access_token);

  if (data.account_id) return { accessToken, adAccountId: data.account_id };

  const res = await fetch(`${BASE}/me/adaccounts?fields=id&access_token=${accessToken}`);
  const json = await res.json() as { data: Array<{ id: string }> };
  if (!json.data?.length) throw new Error('No Meta ad accounts found');

  const adAccountId = json.data[0].id;
  await db.from('platform_tokens')
    .update({ account_id: adAccountId })
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta');

  return { accessToken, adAccountId };
}

// Create a Meta Ad Set under an existing campaign.
// dailyBudgetUsd is split from the parent campaign budget (e.g. 50% for each variant).
export async function createMetaAdSet(
  campaignExternalId: string,
  name: string,
  dailyBudgetUsd: number,
  tenantId: string,
): Promise<string | null> {
  try {
    const { accessToken, adAccountId } = await getMetaCredentials(tenantId);
    const dailyBudgetCents = Math.round(dailyBudgetUsd * 100);

    const params = new URLSearchParams({
      name,
      campaign_id: campaignExternalId,
      daily_budget: String(dailyBudgetCents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      status: 'ACTIVE',
      targeting: JSON.stringify({ geo_locations: { countries: ['US'] }, age_min: 18 }),
      access_token: accessToken,
    });

    const res = await fetch(`${BASE}/${adAccountId}/adsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const json = await res.json() as { id?: string; error?: { message: string } };
    if (!res.ok || json.error) {
      console.error('Meta Ad Set creation failed:', json.error?.message);
      return null;
    }

    return json.id!;
  } catch (err) {
    console.error('createMetaAdSet error:', err);
    return null;
  }
}

// Fetch cumulative insights for a specific Ad Set.
export async function getMetaAdSetInsights(
  adSetExternalId: string,
  tenantId: string,
  days = 7,
): Promise<{ clicks: number; impressions: number; spend: number } | null> {
  try {
    const { accessToken } = await getMetaCredentials(tenantId);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);

    const url =
      `${BASE}/${adSetExternalId}/insights?` +
      `fields=clicks,impressions,spend&` +
      `time_range={"since":"${since}","until":"${until}"}&` +
      `access_token=${accessToken}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json() as { data: Array<{ clicks: string; impressions: string; spend: string }> };
    const row = json.data?.[0];
    if (!row) return { clicks: 0, impressions: 0, spend: 0 };

    return {
      clicks: parseInt(row.clicks ?? '0'),
      impressions: parseInt(row.impressions ?? '0'),
      spend: parseFloat(row.spend ?? '0'),
    };
  } catch {
    return null;
  }
}

// Pause a Meta Ad Set (called when the losing variant is determined).
export async function pauseMetaAdSet(adSetExternalId: string, tenantId: string): Promise<void> {
  try {
    const { accessToken } = await getMetaCredentials(tenantId);
    await fetch(`${BASE}/${adSetExternalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status: 'PAUSED', access_token: accessToken }),
    });
  } catch { /* silently ignore — manual pause fallback */ }
}

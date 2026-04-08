// Google Ads REST API — Campaign management
// Docs: https://developers.google.com/google-ads/api/rest/reference/rest
// Requires: GOOGLE_ADS_DEVELOPER_TOKEN env var (pending approval)

import { db, decryptToken } from '@vigmis/db';
import type { CampaignSpec, CampaignResult } from '../campaign.interface.js';

const GOOGLE_ADS_API_VERSION = 'v18';
const BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

// Map our campaign type → Google Ads channel type
const CHANNEL_MAP: Record<string, string> = {
  search:   'SEARCH',
  display:  'DISPLAY',
  shopping: 'SHOPPING',
};

function getDeveloperToken(): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!token) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not set — pending Google approval');
  return token;
}

async function getAccessToken(tenantId: string): Promise<string> {
  const { data, error } = await db
    .from('platform_tokens')
    .select('access_token, expires_at')
    .eq('tenant_id', tenantId)
    .eq('platform', 'google')
    .single();

  if (error || !data) throw new Error(`No Google token for tenant ${tenantId}`);
  return decryptToken(data.access_token);
}

async function getCustomerId(tenantId: string, accessToken: string): Promise<string> {
  // Check stored account_id first
  const { data } = await db
    .from('platform_tokens')
    .select('account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'google')
    .single();

  if (data?.account_id) return data.account_id;

  // Fetch accessible customers
  const devToken = getDeveloperToken();
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
    },
  });

  if (!res.ok) throw new Error(`Google customers fetch failed: ${await res.text()}`);

  const json = await res.json() as { resourceNames: string[] };
  if (!json.resourceNames?.length) throw new Error('No Google Ads accounts found');

  // resourceNames[0] = "customers/1234567890"
  const customerId = json.resourceNames[0].split('/')[1];

  await db
    .from('platform_tokens')
    .update({ account_id: customerId })
    .eq('tenant_id', tenantId)
    .eq('platform', 'google');

  return customerId;
}

async function createBudget(
  customerId: string,
  accessToken: string,
  devToken: string,
  dailyBudgetMicros: number,
  name: string,
): Promise<string> {
  const res = await fetch(`${BASE}/customers/${customerId}/campaignBudgets:mutate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{
        create: {
          name: `${name}_Budget`,
          amountMicros: String(dailyBudgetMicros),
          deliveryMethod: 'STANDARD',
        },
      }],
    }),
  });

  if (!res.ok) throw new Error(`Budget creation failed: ${await res.text()}`);
  const json = await res.json() as { results: Array<{ resourceName: string }> };
  return json.results[0].resourceName; // e.g. "customers/123/campaignBudgets/456"
}

export async function createGoogleCampaign(
  spec: CampaignSpec,
  tenantId: string,
): Promise<CampaignResult> {
  try {
    const devToken = getDeveloperToken();
    const accessToken = await getAccessToken(tenantId);
    const customerId = await getCustomerId(tenantId, accessToken);

    const dailyBudgetMicros = spec.dailyBudgetUsd * 1_000_000;
    const budgetResource = await createBudget(
      customerId, accessToken, devToken, dailyBudgetMicros, spec.name,
    );

    const channelType = CHANNEL_MAP[spec.type] ?? 'SEARCH';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const res = await fetch(`${BASE}/customers/${customerId}/campaigns:mutate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': devToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operations: [{
          create: {
            name: spec.name,
            advertisingChannelType: channelType,
            status: 'PAUSED',
            campaignBudget: budgetResource,
            manualCpc: { enhancedCpcEnabled: false },
            startDate: today,
          },
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { externalId: null, name: spec.name, platform: 'google', status: 'error', error: err };
    }

    const json = await res.json() as { results: Array<{ resourceName: string }> };
    const resourceName = json.results[0].resourceName; // "customers/123/campaigns/456"
    const externalId = resourceName.split('/').pop()!;

    return { externalId, name: spec.name, platform: 'google', status: 'paused' };
  } catch (err) {
    return {
      externalId: null,
      name: spec.name,
      platform: 'google',
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function pauseGoogleCampaign(
  externalId: string,
  tenantId: string,
): Promise<void> {
  const devToken = getDeveloperToken();
  const accessToken = await getAccessToken(tenantId);
  const customerId = await getCustomerId(tenantId, accessToken);

  await fetch(`${BASE}/customers/${customerId}/campaigns:mutate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{
        update: { resourceName: `customers/${customerId}/campaigns/${externalId}`, status: 'PAUSED' },
        updateMask: 'status',
      }],
    }),
  });
}

export async function resumeGoogleCampaign(
  externalId: string,
  tenantId: string,
): Promise<void> {
  const devToken = getDeveloperToken();
  const accessToken = await getAccessToken(tenantId);
  const customerId = await getCustomerId(tenantId, accessToken);

  await fetch(`${BASE}/customers/${customerId}/campaigns:mutate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{
        update: { resourceName: `customers/${customerId}/campaigns/${externalId}`, status: 'ENABLED' },
        updateMask: 'status',
      }],
    }),
  });
}

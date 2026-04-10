// TikTok Marketing API v1.3 — Campaign management
// Docs: https://business-api.tiktok.com/portal/docs?id=1739314408972289
//
// TikTok campaign objectives map:
//   leads      → LEAD_GENERATION
//   purchases  → CONVERSIONS
//   traffic    → TRAFFIC
//   awareness  → REACH
//
// NOTE: TikTok requires an advertiser_id (Ads Manager account).
// It is stored in platform_tokens.account_id after OAuth.

import { db, decryptToken } from '@vigmis/db';
import type { CampaignSpec, CampaignResult } from '../campaign.interface.js';

const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3';

const OBJECTIVE_MAP: Record<string, string> = {
  leads:     'LEAD_GENERATION',
  purchases: 'CONVERSIONS',
  traffic:   'TRAFFIC',
  awareness: 'REACH',
};

async function getCredentials(tenantId: string): Promise<{ accessToken: string; advertiserId: string }> {
  const { data, error } = await db
    .from('platform_tokens')
    .select('access_token, account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'tiktok')
    .single();

  if (error || !data) throw new Error(`No TikTok token for tenant ${tenantId}`);
  if (!data.account_id) throw new Error(`No TikTok advertiser_id for tenant ${tenantId} — re-connect TikTok`);

  return {
    accessToken: decryptToken(data.access_token),
    advertiserId: data.account_id,
  };
}

async function tiktokPost(path: string, accessToken: string, body: object): Promise<any> {
  const res = await fetch(`${TIKTOK_API}${path}`, {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function createTikTokCampaign(
  spec: CampaignSpec,
  tenantId: string,
): Promise<CampaignResult> {
  try {
    const { accessToken, advertiserId } = await getCredentials(tenantId);
    const objective = OBJECTIVE_MAP[spec.goal] ?? 'TRAFFIC';

    // TikTok budget is in local currency (micro-units not needed — raw USD here)
    // Budget type: DAILY. Min $20/day on TikTok.
    const dailyBudget = Math.max(20, spec.dailyBudgetUsd);

    const json = await tiktokPost('/campaign/create/', accessToken, {
      advertiser_id: advertiserId,
      campaign_name: spec.name,
      objective_type: objective,
      budget_mode: 'BUDGET_MODE_DAY',
      budget: dailyBudget,
      operation_status: 'DISABLE', // start paused; user enables from dashboard
    });

    if (json.code !== 0) {
      return {
        externalId: null,
        name: spec.name,
        platform: 'tiktok',
        status: 'error',
        error: json.message ?? 'TikTok campaign creation failed',
      };
    }

    return {
      externalId: json.data?.campaign_id ?? null,
      name: spec.name,
      platform: 'tiktok',
      status: 'paused',
    };
  } catch (err) {
    return {
      externalId: null,
      name: spec.name,
      platform: 'tiktok',
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function pauseTikTokCampaign(
  externalId: string,
  tenantId: string,
): Promise<void> {
  const { accessToken, advertiserId } = await getCredentials(tenantId);
  await tiktokPost('/campaign/update/status/', accessToken, {
    advertiser_id: advertiserId,
    campaign_ids: [externalId],
    operation_status: 'DISABLE',
  });
}

export async function resumeTikTokCampaign(
  externalId: string,
  tenantId: string,
): Promise<void> {
  const { accessToken, advertiserId } = await getCredentials(tenantId);
  await tiktokPost('/campaign/update/status/', accessToken, {
    advertiser_id: advertiserId,
    campaign_ids: [externalId],
    operation_status: 'ENABLE',
  });
}

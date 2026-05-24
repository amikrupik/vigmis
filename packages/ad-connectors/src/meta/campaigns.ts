// Meta Marketing API — Campaign management
// Docs: https://developers.facebook.com/docs/marketing-api/campaigns

import { db, decryptToken } from '@vigmis/db';
import type { CampaignSpec, CampaignResult } from '../campaign.interface.js';

const META_API_VERSION = 'v19.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Map our goal → Meta campaign objective
const OBJECTIVE_MAP: Record<string, string> = {
  leads:      'OUTCOME_LEADS',
  purchases:  'OUTCOME_SALES',
  traffic:    'OUTCOME_TRAFFIC',
  awareness:  'OUTCOME_AWARENESS',
};

async function getAccessToken(tenantId: string): Promise<string> {
  const { data, error } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .single();

  if (error || !data) throw new Error(`No Meta token for tenant ${tenantId}`);
  return decryptToken(data.access_token);
}

async function getAdAccountId(tenantId: string, _accessToken: string): Promise<string> {
  // Require an explicit user-selected account_id. The onboarding flow now forces
  // a Meta Assets selection step right after OAuth — if it's still missing here,
  // we'd be guessing, and a wrong guess publishes ads to the wrong client's account.
  const { data } = await db
    .from('platform_tokens')
    .select('account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .maybeSingle();

  if (data?.account_id) return data.account_id;

  throw new Error('No Meta ad account selected. Open Dashboard → Social → Connect and pick which ad account Vigmis should manage.');
}

export async function createMetaCampaign(
  spec: CampaignSpec,
  tenantId: string,
): Promise<CampaignResult> {
  try {
    const accessToken = await getAccessToken(tenantId);
    const adAccountId = await getAdAccountId(tenantId, accessToken);

    const objective = OBJECTIVE_MAP[spec.goal] ?? 'OUTCOME_TRAFFIC';
    const dailyBudgetCents = Math.round(spec.dailyBudgetUsd * 100);

    const params = new URLSearchParams({
      name: spec.name,
      objective,
      status: 'PAUSED',
      daily_budget: String(dailyBudgetCents),
      special_ad_categories: '[]',
      access_token: accessToken,
    });

    const res = await fetch(`${BASE}/${adAccountId}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const json = await res.json() as { id?: string; error?: { message: string } };

    if (!res.ok || json.error) {
      return {
        externalId: null,
        name: spec.name,
        platform: 'meta',
        status: 'error',
        error: json.error?.message ?? 'Unknown Meta API error',
      };
    }

    return {
      externalId: json.id!,
      name: spec.name,
      platform: 'meta',
      status: 'paused',
    };
  } catch (err) {
    return {
      externalId: null,
      name: spec.name,
      platform: 'meta',
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function pauseMetaCampaign(
  externalId: string,
  tenantId: string,
): Promise<void> {
  const accessToken = await getAccessToken(tenantId);
  await fetch(`${BASE}/${externalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status: 'PAUSED', access_token: accessToken }),
  });
}

export async function resumeMetaCampaign(
  externalId: string,
  tenantId: string,
): Promise<void> {
  const accessToken = await getAccessToken(tenantId);
  await fetch(`${BASE}/${externalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status: 'ACTIVE', access_token: accessToken }),
  });
}

export async function listMetaCampaigns(tenantId: string): Promise<Array<{
  id: string;
  name: string;
  status: string;
  daily_budget: string;
}>> {
  try {
    const accessToken = await getAccessToken(tenantId);
    const adAccountId = await getAdAccountId(tenantId, accessToken);

    const res = await fetch(
      `${BASE}/${adAccountId}/campaigns?fields=id,name,status,daily_budget&access_token=${accessToken}`,
    );
    if (!res.ok) return [];

    const json = await res.json() as { data: Array<{ id: string; name: string; status: string; daily_budget: string }> };
    return (json.data ?? []).filter(c => c.name.startsWith('VIGMIS_'));
  } catch {
    return [];
  }
}

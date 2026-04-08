'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiGet(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getDashboardData() {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const [status, campaigns] = await Promise.all([
    apiGet('/onboarding/status', token),
    apiGet('/campaigns', token),
  ]);

  return {
    onboardingComplete: status?.onboardingComplete ?? false,
    settings: status?.settings ?? null,
    connected: status?.connected ?? { google: false, meta: false },
    campaigns: campaigns?.campaigns ?? [],
  };
}

export async function launchCampaigns(hasCreative: boolean) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/campaigns/launch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ hasCreative }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Launch failed');
  return data;
}

export async function pauseCampaign(id: string) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/campaigns/${id}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Pause failed');
}

export async function resumeCampaign(id: string) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/campaigns/${id}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Resume failed');
}

'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiCall(path: string, method = 'GET', body?: object) {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Existing ──────────────────────────────────────────────────────────────────

export async function getDashboardData() {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const [status, campaigns] = await Promise.all([
    apiCall('/onboarding/status'),
    apiCall('/campaigns'),
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalytics(period: 7 | 30 | 90 = 30) {
  return apiCall(`/analytics/summary?period=${period}`);
}

// ── Intelligence ──────────────────────────────────────────────────────────────

export async function generateAdCopy(platform: string, goal: string, websiteContext: string, territory?: string) {
  return apiCall('/intelligence/ad-copy', 'POST', { platform, goal, websiteContext, territory });
}

export async function scoreCreative(type: string, description: string, targetAudience: string, platform: string, goal: string) {
  return apiCall('/intelligence/score-creative', 'POST', { type, description, targetAudience, platform, goal });
}

export async function discoverAudiences(settings: any, websiteAnalysis: string, territory?: string) {
  return apiCall('/intelligence/audiences', 'POST', { settings, websiteAnalysis, territory });
}

export async function getTerritoryIntel(geo_include: string[], website_url: string, goal: string) {
  return apiCall('/intelligence/territory', 'POST', { geo_include, website_url, goal });
}

export async function getCompetitors(keyword: string, territory?: string) {
  return apiCall(`/intelligence/competitors?keyword=${encodeURIComponent(keyword)}&territory=${encodeURIComponent(territory ?? '')}`);
}

export async function getBudgetPacing() {
  return apiCall('/intelligence/pacing');
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export async function getAlerts() {
  return apiCall('/alerts');
}

export async function dismissAlert(alert_id: string) {
  return apiCall('/alerts/dismiss', 'POST', { alert_id });
}

// ── Creatives ─────────────────────────────────────────────────────────────────

export async function generateCreative(
  type: 'avatar' | 'cinematic' | 'animation',
  brief: Record<string, any>,
  platform?: string,
  campaign_id?: string,
) {
  return apiCall('/creatives/generate', 'POST', { type, brief, platform, campaign_id });
}

export async function getCreativeStatus(jobId: string) {
  return apiCall(`/creatives/${jobId}/status`);
}

export async function getCreatives() {
  return apiCall('/creatives');
}

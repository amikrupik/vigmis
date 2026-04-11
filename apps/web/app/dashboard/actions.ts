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

// ── A/B Testing ──────────────────────────────────────────────────────────────

export async function createAbTest(name: string, variants: any[], platform: string, goal: string) {
  return apiCall('/intelligence/ab-test/create', 'POST', { name, variants, platform, goal });
}

export async function getAbTests() {
  return apiCall('/intelligence/ab-test');
}

export async function concludeAbTest(test_id: string) {
  return apiCall('/intelligence/ab-test/conclude', 'POST', { test_id });
}

// ── Creative Element Analytics ────────────────────────────────────────────────

export async function analyzeCreativeElements(creatives: any[], platform: string, goal: string) {
  return apiCall('/intelligence/creative-elements', 'POST', { creatives, platform, goal });
}

// ── Budget Shifting ───────────────────────────────────────────────────────────

export async function getBudgetShiftRecommendation() {
  return apiCall('/intelligence/budget-shift');
}

export async function applyBudgetShifts(shifts: Array<{ campaign_id: string; new_daily_budget_usd: number }>) {
  return apiCall('/intelligence/budget-shift', 'POST', { shifts });
}

// ── CRO Audit ────────────────────────────────────────────────────────────────

export async function runCroAudit(website_url: string, goal: string) {
  return apiCall('/intelligence/cro-audit', 'POST', { website_url, goal });
}

// ── Alert Settings ────────────────────────────────────────────────────────────

export async function getAlertSettings() {
  return apiCall('/alerts/settings');
}

export async function saveAlertSettings(settings: { email?: string; whatsapp?: string; email_enabled?: boolean; whatsapp_enabled?: boolean }) {
  return apiCall('/alerts/settings', 'POST', settings);
}

export async function sendTestAlert() {
  return apiCall('/alerts/test', 'POST', {});
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

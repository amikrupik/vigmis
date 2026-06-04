'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiCall(path: string, method = 'GET', body?: object) {
  const { getToken } = await auth();
  const token = await getToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

export async function updateCampaignBudget(id: string, daily_budget_usd: number) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_URL}/campaigns/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_budget_usd }),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
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

export async function getAnalytics(period: 7 | 30 | 90 = 30, compare = false) {
  return apiCall(`/analytics/summary?period=${period}&compare=${compare}`);
}

export async function getAnalyticsDaily() {
  return apiCall('/analytics/daily');
}

export async function getConversionIntelligence(period: 7 | 30 | 90 = 30) {
  return apiCall(`/track/true-roas?period=${period}`);
}

export async function getTrackingStatus() {
  return apiCall('/track/status');
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

// ── GEO Audit ─────────────────────────────────────────────────────────────────

export async function runGeoAudit(website_url?: string) {
  return apiCall('/geo/audit', 'POST', { website_url });
}

export async function getGeoReport() {
  return apiCall('/geo/report');
}

// ── History / Timeline ────────────────────────────────────────────────────────

export async function getHistoryTimeline() {
  return apiCall('/history/timeline');
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

// ── Optimization ─────────────────────────────────────────────────────────────

export async function runOptimizationNow() {
  return apiCall('/optimization/run', 'POST', {});
}

export async function getOptimizationHistory() {
  return apiCall('/optimization/history');
}

export async function getOptimizationSettings() {
  return apiCall('/optimization/settings');
}

export async function saveOptimizationSettings(settings: { risk_level: 'conservative' | 'moderate' | 'aggressive'; management_percentage?: number }) {
  return apiCall('/optimization/settings', 'POST', settings);
}

export async function getApprovalRequests() {
  return apiCall('/optimization/approvals');
}

export async function approveRequest(id: string) {
  return apiCall(`/optimization/approvals/${id}/approve`, 'POST', {});
}

export async function rejectRequest(id: string) {
  return apiCall(`/optimization/approvals/${id}/reject`, 'POST', {});
}

// ── Decision Protocols ────────────────────────────────────────────────────────

export async function getProtocols(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return apiCall(`/protocols${qs}`);
}

export async function getProtocol(id: string) {
  return apiCall(`/protocols/${id}`);
}

export async function replyToProtocol(id: string, message: string) {
  return apiCall(`/protocols/${id}/reply`, 'POST', { message });
}

export async function approveProtocol(id: string) {
  return apiCall(`/protocols/${id}/approve`, 'POST', {});
}

export async function rejectProtocol(id: string, reason?: string) {
  return apiCall(`/protocols/${id}/reject`, 'POST', { reason });
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

// ── Emergency controls ────────────────────────────────────────────────────────

export async function pauseAllCampaigns() {
  return apiCall('/campaigns/pause-all', 'POST', {});
}

export async function resumeAllCampaigns() {
  return apiCall('/campaigns/resume-all', 'POST', {});
}

// ── Account ───────────────────────────────────────────────────────────────────

export async function deleteAccount() {
  return apiCall('/account', 'DELETE');
}

export async function getExportUrl() {
  const { getToken } = await auth();
  const token = await getToken();
  return { url: `${API_URL}/account/export`, token };
}

export type MetaAdAccount = {
  id: string;
  name: string;
  currency: string | null;
  active: boolean;
  business: string | null;
};

export async function getMetaAdAccounts(): Promise<{ accounts: MetaAdAccount[]; selected: string | null } | null> {
  return apiCall('/connectors/meta/ad-accounts');
}

export async function selectMetaAdAccount(account_id: string): Promise<{ success: boolean } | null> {
  return apiCall('/connectors/meta/ad-account', 'POST', { account_id });
}

export async function getMetaScopes(): Promise<{ connected: boolean; scopes: string[]; missing: string[]; needs_reconnect: boolean } | null> {
  return apiCall('/connectors/meta/scopes');
}

export async function disconnectMeta(): Promise<{ success: boolean } | null> {
  return apiCall('/connectors/meta/disconnect', 'POST', {});
}

export type MetaPage = {
  page_id: string;
  name: string;
  category: string | null;
  instagram_user_id: string | null;
  instagram_username: string | null;
};

export async function getMetaPages(): Promise<{ pages: MetaPage[]; selected_page_id: string | null; selected_instagram_user_id: string | null } | null> {
  return apiCall('/connectors/meta/pages');
}

export async function selectMetaPage(facebook_page_id: string, instagram_user_id: string | null) {
  return apiCall('/connectors/meta/page', 'POST', { facebook_page_id, instagram_user_id });
}

export async function rerunAnalysisServer(): Promise<{ websiteAnalysis?: string; strategy?: any; error?: string } | null> {
  // Re-runs onboarding/analyze with the current saved settings.
  const status = await apiCall('/onboarding/status');
  if (!status?.settings) return { error: 'No settings saved yet' };
  return apiCall('/onboarding/analyze', 'POST', { settings: status.settings });
}

export async function getStrategy(): Promise<{
  settings: any | null;
  history: Array<{ id: string; action: string; platform?: string; actor: string; payload: any; created_at: string }>;
} | null> {
  return apiCall('/onboarding/strategy');
}

export type Ga4Property = {
  property_id: string;
  display_name: string;
  account_id?: string;
  currency?: string;
  time_zone?: string;
};

export async function getGa4Properties(): Promise<{ properties: Ga4Property[] } | null> {
  return apiCall('/ga4/properties');
}

export async function getGa4Settings(): Promise<{ settings: { property_id: string; property_name?: string; last_synced_at?: string } | null } | null> {
  return apiCall('/ga4/settings');
}

export async function setGa4Property(property_id: string, property_name?: string) {
  return apiCall('/ga4/settings', 'POST', { property_id, property_name });
}

export async function runGa4Sync(): Promise<{ rows: number; from?: string; to?: string } | null> {
  return apiCall('/ga4/sync', 'POST', {});
}

export async function getSocialSettings() {
  return apiCall('/social/settings');
}

export async function updateSocialSettings(settings: object) {
  return apiCall('/social/settings', 'PUT', settings);
}

export async function getSocialPosts(params?: { status?: string; platform?: string }) {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.platform) q.set('platform', params.platform);
  return apiCall(`/social/posts${q.toString() ? `?${q}` : ''}`);
}

export async function updateSocialPost(
  id: string,
  fields: { content?: string; image_url?: string | null; scheduled_for?: string },
) {
  return apiCall(`/social/posts/${id}`, 'PATCH', fields);
}

export async function deleteSocialPost(id: string) {
  return apiCall(`/social/posts/${id}`, 'DELETE');
}

export async function approveSocialPost(
  id: string,
  opts?: { editedContent?: string; publishNow?: boolean; scheduledFor?: string },
) {
  return apiCall(`/social/posts/${id}/approve`, 'POST', {
    edited_content: opts?.editedContent,
    publish_now: opts?.publishNow,
    scheduled_for: opts?.scheduledFor,
  });
}

export async function rejectSocialPost(id: string, reason?: string) {
  return apiCall(`/social/posts/${id}/reject`, 'POST', { reason });
}

export async function generateSocialContent(brief?: {
  product?: string;
  message?: string;
  style?: string;
  cta?: string;
  restrictions?: string;
} | null) {
  return apiCall('/social/generate', 'POST', brief ? { brief } : {});
}

export async function getSocialAnalytics() {
  return apiCall('/social/analytics');
}

export async function getSocialComments(params?: { status?: string; sentiment?: string }) {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.sentiment) q.set('sentiment', params.sentiment);
  return apiCall(`/social/comments${q.toString() ? `?${q}` : ''}`);
}

export async function sendSocialCommentReply(id: string, replyText: string) {
  return apiCall(`/social/comments/${id}/send`, 'POST', { reply_text: replyText });
}

export async function ignoreSocialComment(id: string) {
  return apiCall(`/social/comments/${id}/ignore`, 'POST');
}

export async function hideSocialComment(id: string) {
  return apiCall(`/social/comments/${id}/hide`, 'POST');
}

export async function cancelCoolingOff(postId: string) {
  return apiCall(`/social/posts/${postId}/cancel-cooling-off`, 'POST');
}

// ── Brand Asset Library ────────────────────────────────────────────────────────

export async function getBrandAssets(kind?: 'image' | 'video') {
  return apiCall(`/assets${kind ? `?kind=${kind}` : ''}`);
}

export async function deleteBrandAsset(id: string) {
  return apiCall(`/assets/${id}`, 'DELETE');
}

export async function uploadBrandAsset(file: File): Promise<{ public_url: string; id: string; kind: string } | null> {
  const { getToken } = await auth();
  const token = await getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/assets/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Export (returns raw text/csv or text/html) ────────────────────────────────

async function apiRaw(path: string): Promise<{ content: string; contentType: string } | null> {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const content = await res.text();
  const contentType = res.headers.get('content-type') ?? 'text/plain';
  return { content, contentType };
}

export async function exportAnalyticsCSV(period: 7 | 30 | 90 = 30) {
  return apiRaw(`/export/analytics?period=${period}&format=csv`);
}

export async function exportAnalyticsHTML(period: 7 | 30 | 90 = 30) {
  return apiRaw(`/export/analytics?period=${period}&format=html`);
}

export async function exportCampaignsCSV() {
  return apiRaw('/export/campaigns?format=csv');
}

export async function exportCampaignsHTML() {
  return apiRaw('/export/campaigns?format=html');
}

export async function exportSocialCSV() {
  return apiRaw('/export/social?format=csv');
}

export async function exportSocialHTML() {
  return apiRaw('/export/social?format=html');
}

export async function exportMarketingPlanHTML() {
  return apiRaw('/export/marketing-plan?format=html');
}

export async function exportInvoiceHTML() {
  return apiRaw('/export/invoice?format=html');
}

// ── Batch 8: Creative Scoring (vision) ───────────────────────────────────────

export async function scoreCreativeAsset(
  imageUrl: string,
  platform: string,
  goal?: string,
) {
  return apiCall('/creatives/score', 'POST', {
    image_url: imageUrl,
    platform,
    goal: goal ?? 'awareness',
  });
}

// ── Batch 8: Creative Theme Insights ─────────────────────────────────────────

export async function getCreativeThemes() {
  return apiCall('/intelligence/creative-themes');
}

// ── Batch 8: Budget Scenario Forecast ────────────────────────────────────────

export async function getBudgetForecast(budget: number) {
  return apiCall(`/analytics/budget-forecast?budget=${encodeURIComponent(budget)}`);
}

// ── Conversion Readiness ──────────────────────────────────────────────────────

export async function getReadinessScore(): Promise<{
  score: number;
  report: { verdict: string; issues: string[] } | null;
  evaluated_at: string | null;
} | null> {
  const data = await apiCall('/readiness');
  if (!data) return null;
  return {
    score: data.score ?? 0,
    report: data.report ?? null,
    evaluated_at: data.evaluated_at ?? null,
  };
}

export async function runReadinessAudit(): Promise<{ report: any } | null> {
  return apiCall('/readiness/audit', 'POST');
}

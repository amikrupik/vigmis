'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function getToken(): Promise<string> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

async function post<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export async function getInsights() {
  return get<{ insights: Array<{ id: string; insight_kind: string; theme: string; occurrence_count: number; suggested_action: string; status: string; last_seen_at: string }> }>('/comments/insights');
}

export async function dismissInsight(id: string) {
  return post(`/comments/insights/${id}/dismiss`);
}

export async function refreshInsights() {
  return post<{ themes_persisted: number }>('/comments/insights/refresh');
}

export async function getReadiness() {
  return get<{ report: { score: number; verdict: string; reasoning: string; issues: Array<{ severity: string; category: string; finding: string; fix: string }> }; score: number; evaluated_at: string }>('/readiness');
}

export async function runReadinessAudit() {
  return post<{ report: any }>('/readiness/audit');
}

export async function getBriefingPrefs() {
  return get<{ preferences: any }>('/briefings/preferences');
}

export async function updateBriefingPrefs(prefs: Record<string, unknown>) {
  return post('/briefings/preferences', prefs);
}

export async function sendBriefingNow() {
  return post<{ sent: boolean; reason?: string }>('/briefings/send-now');
}

export async function getCrisisCheck() {
  return post<{ decision: any; alerted: boolean }>('/comments/crisis/check');
}

export async function getWeeklyStrategy() {
  return get<{ analysis: any }>('/intelligence/weekly-strategy');
}

export async function runWeeklyStrategy() {
  return post<{ analysis: any; ok: boolean }>('/intelligence/weekly-strategy/run');
}

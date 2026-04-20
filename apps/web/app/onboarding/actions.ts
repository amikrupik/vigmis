'use server';

import { auth } from '@clerk/nextjs/server';
import type { ConversationMessage, StrategyPlan } from '@vigmis/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Topic =
  | 'website'
  | 'budget'
  | 'management_percentage'
  | 'goal'
  | 'geography'
  | 'exclusions'
  | 'open_notes';

export interface OnboardingSettings {
  website_url: string;
  budget_monthly_ils: number;
  management_percentage: number;
  goal: 'leads' | 'purchases' | 'traffic' | 'awareness';
  geo_include: string[];
  geo_exclude: string[];
  exclusions: string;
  open_notes: string;
  risk_level: 'conservative' | 'balanced' | 'aggressive';
  dayparting_rules: Array<{ day: number; start_hour: number; end_hour: number }>;
  has_parallel_campaigns?: boolean; // campaigns running outside Vigmis on same platforms
}

export interface ChatResponse {
  message: string;
  coveredTopics: Topic[];
  settings: OnboardingSettings | null;
}

export interface AnalysisResult {
  websiteAnalysis: string;
  marketResearch: string;
  strategy: StrategyPlan;
}

async function getToken(): Promise<string> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

// ── Onboarding chat — proxied through API (which has AI keys) ─────────────────

export async function sendMessage(
  history: ConversationMessage[],
  userMessage: string,
  coveredTopics: Topic[],
): Promise<ChatResponse> {
  const token = await getToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}/onboarding/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, message: userMessage, coveredTopics }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { message: `Connection error: ${msg}. Please try again.`, coveredTopics, settings: null };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    return { message: `Server error: ${text}. Please try again.`, coveredTopics, settings: null };
  }

  return res.json();
}

// ── Strategy discussion — get Vigmis's honest opinion before applying changes ──

export async function discussStrategy(
  strategy: object,
  clientRequest: string,
  settings: OnboardingSettings,
): Promise<string> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/onboarding/discuss`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy, clientRequest, settings }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Failed');
    throw new Error(text);
  }

  const data = await res.json();
  return data.response as string;
}

// ── Website understanding quick check — before full analysis ──────────────────

export interface WebsiteCheck {
  adequate: boolean;
  what_they_sell: string | null;
  hero_product: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  unclear: string[];
  summary: string | null;
}

export async function checkWebsite(websiteUrl: string): Promise<WebsiteCheck> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/onboarding/website-check`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ website_url: websiteUrl }),
  });
  if (!res.ok) return { adequate: false, what_they_sell: null, hero_product: null, target_audience: null, brand_voice: null, unclear: ['Could not analyze website'], summary: null };
  return res.json();
}

// ── Full analysis pipeline — proxied through API ──────────────────────────────

export async function runAnalysis(settings: OnboardingSettings, feedback?: string): Promise<AnalysisResult> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/onboarding/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings, feedback }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Analysis failed');
    throw new Error(text);
  }

  return res.json();
}

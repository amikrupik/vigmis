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

// ── Full analysis pipeline — proxied through API ──────────────────────────────

export async function runAnalysis(settings: OnboardingSettings): Promise<AnalysisResult> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/onboarding/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Analysis failed');
    throw new Error(text);
  }

  return res.json();
}

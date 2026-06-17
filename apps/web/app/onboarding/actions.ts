'use server';

import { auth } from '@clerk/nextjs/server';
import type { ConversationMessage, StrategyPlan } from '@vigmis/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Topic =
  | 'business_type'
  | 'website'
  | 'budget'
  | 'management_percentage'
  | 'goal'
  | 'margin_pct'
  | 'hero_product'
  | 'geography'
  | 'exclusions'
  | 'open_notes';

export interface OnboardingSettings {
  business_type: 'ecommerce' | 'hero_product' | 'lead_gen' | 'saas' | 'general_store';
  website_url: string;
  budget_monthly_ils: number;
  management_percentage: number;
  goal: 'leads' | 'purchases' | 'traffic' | 'awareness';
  margin_pct?: number | null;
  hero_product_name?: string | null;
  hero_product_margin_pct?: number | null;
  geo_include: string[];
  geo_exclude: string[];
  exclusions: string;
  open_notes: string;
  risk_level: 'conservative' | 'balanced' | 'aggressive';
  dayparting_rules: Array<{ day: number; start_hour: number; end_hour: number }>;
  has_parallel_campaigns?: boolean;
  preferred_platforms?: string[] | null;
  budget_currency?: string;
  budget_original_amount?: number | null;
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

export interface AnalysisError {
  error: string;
  code: string;
  message: string;
  scraped_pages?: string[];
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

export async function runAnalysis(settings: OnboardingSettings, feedback?: string, langOverride?: string): Promise<AnalysisResult | AnalysisError> {
  const token = await getToken();

  // Read vigmis_lang cookie (set by the UI language switcher). Default to 'en'.
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const lang = langOverride ?? cookieStore.get('vigmis_lang')?.value ?? 'en';

  const res = await fetch(`${API_URL}/onboarding/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings, feedback, lang }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'analysis_failed', code: 'analysis_failed', message: 'Analysis failed. Please try again.' }));
    return { error: body.error ?? 'analysis_failed', code: body.error ?? 'analysis_failed', message: body.message ?? 'Analysis failed. Please try again.', scraped_pages: body.scraped_pages };
  }

  return res.json();
}

// ── Operator incident report ──────────────────────────────────────────────────

export async function reportIncident(type: string, message: string, count: number): Promise<void> {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/ops/report-incident`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message, path: '/onboarding', count }),
    });
  } catch { /* best-effort — never crash the caller */ }
}

// ── Tracking / Conversion Intelligence ───────────────────────────────────────

export interface TrackingStatus {
  pixel_active: boolean;
  last_event_at: string | null;
  tracking_verified: boolean;
  shopify_connected: boolean;
  shopify_shop: string | null;
  events_30d: number;
  margin_pct: number | null;
  business_type: string;
  snippet_url: string;
}

export async function getTrackingStatus(): Promise<TrackingStatus | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/track/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export interface PixelSnippet {
  snippet: string;
  pid: string;
}

export async function getPixelSnippet(): Promise<PixelSnippet | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/track/snippet`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function verifyPixel(): Promise<{ verified: boolean; message?: string }> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/track/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { verified: false };
    return res.json();
  } catch { return { verified: false }; }
}

export async function startShopifyConnect(shop: string): Promise<{ auth_url?: string; error?: string }> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/track/shopify/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error ?? 'Failed to start Shopify connection' };
    }
    return res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Connection failed' };
  }
}

// Conversion Readiness — "Don't Advertise" capability.
//
// Audits the customer's landing page before letting Vigmis spend money sending
// traffic to it. Vigmis is supposed to replace a marketing manager — and a real
// marketing manager refuses to run ads to a page that won't convert. They tell
// you to fix the page first.
//
// The audit produces:
//   - score 0-100
//   - a list of specific blocking issues
//   - a list of warnings (non-blocking but recommended)
//   - a recommendation: 'ready' | 'fix_before_ads' | 'block'

import { route } from '@vigmis/ai-router';
import { db } from '@vigmis/db';
import { scrapeWebsite } from './website-scraper.js';

export type ReadinessVerdict = 'ready' | 'fix_before_ads' | 'block';

export interface ReadinessIssue {
  severity: 'blocking' | 'warning' | 'info';
  category: string;
  finding: string;
  fix: string;
}

export interface ReadinessReport {
  score: number;                  // 0-100
  verdict: ReadinessVerdict;
  reasoning: string;              // one-sentence summary
  issues: ReadinessIssue[];
  signals: {                       // what we observed
    has_clear_cta: boolean;
    cta_examples: string[];
    has_pricing: boolean;
    has_trust_signals: boolean;
    trust_signal_examples: string[];
    has_contact_info: boolean;
    has_privacy_policy: boolean;
    has_returns_policy: boolean;
    is_business_focused: boolean;  // vs personal/blog/parked
  };
  url: string;
  evaluated_at: string;
}

const AUDIT_PROMPT = `You are an experienced conversion-rate-optimization specialist auditing a landing page before any ads are sent to it. Your job is to refuse to spend money on traffic if the page won't convert.

The customer is about to start running paid ads. Score this landing page on conversion-readiness from 0-100, then list specific issues by severity.

Output STRICT JSON, no markdown fences:
{
  "score": <0-100>,
  "verdict": "ready" | "fix_before_ads" | "block",
  "reasoning": "<one-sentence summary>",
  "signals": {
    "has_clear_cta": <bool>,
    "cta_examples": ["..."],
    "has_pricing": <bool>,
    "has_trust_signals": <bool>,
    "trust_signal_examples": ["..."],
    "has_contact_info": <bool>,
    "has_privacy_policy": <bool>,
    "has_returns_policy": <bool>,
    "is_business_focused": <bool>
  },
  "issues": [
    { "severity": "blocking" | "warning" | "info", "category": "<short>", "finding": "<what's wrong>", "fix": "<specific action>" }
  ]
}

Scoring:
- score >= 75: verdict = "ready". Page is ad-ready.
- score 50-74: verdict = "fix_before_ads". Significant issues, ads would waste money.
- score < 50: verdict = "block". Page is not suitable for paid traffic.

Severity rules:
- "blocking": prevents conversion at scale. Missing CTA. No pricing on a sales page. No checkout. Site error/404. Page in unrelated language to target market.
- "warning": hurts conversion but doesn't kill it. Weak headline. No trust signals. Slow load. Confusing navigation. Mobile issues.
- "info": nice-to-have improvements.

Be tough but specific. Don't list 20 generic issues — list 3-7 real ones with concrete fixes.`;

export interface AuditInput {
  tenantId: string;
  websiteUrl: string;
  targetMarket?: string; // ISO country code
  productLanguage?: string; // ISO 639-1
  goal?: string;          // leads / purchases / traffic / awareness
}

export async function auditConversionReadiness(input: AuditInput): Promise<ReadinessReport> {
  const scraped = await scrapeWebsite(input.websiteUrl);
  if (!scraped || !scraped.confident || scraped.text.length < 200) {
    return {
      score: 0,
      verdict: 'block',
      reasoning: 'Website crawl returned insufficient content — page may be down, parked, or blocking crawlers. Cannot safely send paid traffic.',
      issues: [{
        severity: 'blocking',
        category: 'page_unavailable',
        finding: 'Vigmis could not extract enough content from the page to evaluate it.',
        fix: 'Verify the URL is correct, the site is online, and search engines can crawl it. If correct, contact support.',
      }],
      signals: {
        has_clear_cta: false,
        cta_examples: [],
        has_pricing: false,
        has_trust_signals: false,
        trust_signal_examples: [],
        has_contact_info: false,
        has_privacy_policy: false,
        has_returns_policy: false,
        is_business_focused: false,
      },
      url: input.websiteUrl,
      evaluated_at: new Date().toISOString(),
    };
  }

  const prompt = [
    input.targetMarket ? `TARGET MARKET: ${input.targetMarket}` : '',
    input.productLanguage ? `EXPECTED LANGUAGE: ${input.productLanguage}` : '',
    input.goal ? `CAMPAIGN GOAL: ${input.goal}` : '',
    `URL: ${input.websiteUrl}`,
    '',
    `PAGE CONTENT:`,
    scraped.text.slice(0, 6000),
  ].filter(Boolean).join('\n');

  let raw: string;
  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: AUDIT_PROMPT,
      prompt,
      options: { temperature: 0.2, maxTokens: 1200, tenantId: input.tenantId },
    });
    raw = res.output;
  } catch {
    // If the audit itself fails, default to "fix_before_ads" with an info issue
    // so the customer isn't permanently blocked by transient AI failures.
    return {
      score: 50,
      verdict: 'fix_before_ads',
      reasoning: 'Audit temporarily unavailable. Conservatively withholding the green light until re-run.',
      issues: [{
        severity: 'warning',
        category: 'audit_unavailable',
        finding: 'Conversion-readiness audit failed.',
        fix: 'Re-run the audit from the Strategy tab.',
      }],
      signals: {
        has_clear_cta: false,
        cta_examples: [],
        has_pricing: false,
        has_trust_signals: false,
        trust_signal_examples: [],
        has_contact_info: false,
        has_privacy_policy: false,
        has_returns_policy: false,
        is_business_focused: false,
      },
      url: input.websiteUrl,
      evaluated_at: new Date().toISOString(),
    };
  }

  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      score: 50,
      verdict: 'fix_before_ads',
      reasoning: 'Audit parser error — falling back to conservative verdict.',
      issues: [],
      signals: {
        has_clear_cta: false,
        cta_examples: [],
        has_pricing: false,
        has_trust_signals: false,
        trust_signal_examples: [],
        has_contact_info: false,
        has_privacy_policy: false,
        has_returns_policy: false,
        is_business_focused: false,
      },
      url: input.websiteUrl,
      evaluated_at: new Date().toISOString(),
    };
  }

  const score = clamp(Number(parsed.score) || 0, 0, 100);
  const verdict: ReadinessVerdict =
    parsed.verdict === 'ready' || parsed.verdict === 'fix_before_ads' || parsed.verdict === 'block'
      ? parsed.verdict
      : score >= 75 ? 'ready' : score >= 50 ? 'fix_before_ads' : 'block';

  const report: ReadinessReport = {
    score,
    verdict,
    reasoning: parsed.reasoning ?? '',
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    signals: parsed.signals ?? {
      has_clear_cta: false, cta_examples: [],
      has_pricing: false, has_trust_signals: false, trust_signal_examples: [],
      has_contact_info: false, has_privacy_policy: false, has_returns_policy: false,
      is_business_focused: false,
    },
    url: input.websiteUrl,
    evaluated_at: new Date().toISOString(),
  };

  // Persist for the dashboard + as input to "should we run ads now?" decisions.
  await db.from('client_settings').update({
    conversion_readiness: report,
    conversion_readiness_score: score,
    conversion_readiness_at: report.evaluated_at,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', input.tenantId).then(() => null, () => null);

  return report;
}

/**
 * Gate: can we safely start a paid campaign for this tenant right now?
 * Returns { allow, verdict, score, blockingIssues } so callers can refuse
 * and explain.
 */
export async function gateAdsByReadiness(tenantId: string): Promise<{
  allow: boolean;
  verdict: ReadinessVerdict | 'unknown';
  score: number | null;
  blockingIssues: ReadinessIssue[];
}> {
  const { data } = await db.from('client_settings')
    .select('conversion_readiness, conversion_readiness_score')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data?.conversion_readiness) {
    // No audit yet — allow but warn. The audit should be run automatically
    // during onboarding; this case is "tenant predates the feature".
    return { allow: true, verdict: 'unknown', score: null, blockingIssues: [] };
  }

  const report = data.conversion_readiness as ReadinessReport;
  const blockingIssues = report.issues.filter((i) => i.severity === 'blocking');
  return {
    allow: report.verdict === 'ready',
    verdict: report.verdict,
    score: data.conversion_readiness_score ?? report.score,
    blockingIssues,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

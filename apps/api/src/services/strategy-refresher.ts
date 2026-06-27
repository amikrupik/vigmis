// Strategy refresh service — runs a full re-analysis and creates a
// strategy_update_recommendation. Does NOT auto-apply. The user must explicitly
// approve from the dashboard before any strategy field changes.

import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import { scrapeWebsite } from './website-scraper.js';
import { getAllHistoricalData } from './historical.js';

export interface StrategyRefreshResult {
  recommendationId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJsonFromText(text: string): unknown | null {
  // Strip markdown code fences if present
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fencedMatch ? fencedMatch[1].trim() : text.trim();

  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to heuristic extraction
  }

  // Look for the outermost {...} block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      // Nothing parseable
    }
  }

  return null;
}

/**
 * Compare two strategy_plan objects and return a list of top-level keys
 * whose values differ (shallow comparison; nested diffs noted by key name only).
 */
function computeChangedFields(
  oldPlan: Record<string, unknown>,
  newPlan: Record<string, unknown>,
): string[] {
  const allKeys = new Set([...Object.keys(oldPlan), ...Object.keys(newPlan)]);
  const changed: string[] = [];
  for (const key of allKeys) {
    if (JSON.stringify(oldPlan[key]) !== JSON.stringify(newPlan[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Build a human-readable delta summary from the list of changed fields,
 * comparing old vs. new narrative/insight values where available.
 */
function buildDeltaSummary(
  changedFields: string[],
  oldPlan: Record<string, unknown>,
  newPlan: Record<string, unknown>,
): string {
  if (changedFields.length === 0) {
    return 'No significant changes detected — existing strategy remains valid.';
  }

  const lines: string[] = [`${changedFields.length} area(s) updated after competitive intelligence refresh:`];

  for (const field of changedFields) {
    const oldVal = oldPlan[field];
    const newVal = newPlan[field];

    // For short string values include a snippet; for objects just name the field
    if (typeof oldVal === 'string' && typeof newVal === 'string') {
      const oldSnip = String(oldVal).slice(0, 80).replace(/\n/g, ' ');
      const newSnip = String(newVal).slice(0, 80).replace(/\n/g, ' ');
      lines.push(`  • ${field}: was "${oldSnip}…" → now "${newSnip}…"`);
    } else {
      lines.push(`  • ${field}: updated (object/array)`);
    }
  }

  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runStrategyRefresh(
  tenantId: string,
  triggerType: 'scheduled_refresh' | 'manual',
): Promise<StrategyRefreshResult> {
  // ── 1. Read client_settings ────────────────────────────────────────────────
  const { data: settings, error: settingsError } = await db
    .from('client_settings')
    .select(
      'website_url, strategy_plan, website_analysis, business_name, goal, geo_include, budget_monthly_ils, management_percentage, budget_currency, business_type',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (settingsError) {
    throw new Error(`Failed to read client_settings: ${settingsError.message}`);
  }
  if (!settings) {
    throw new Error('No client_settings found for this tenant');
  }
  if (!settings.strategy_plan) {
    throw new Error('No existing strategy to refresh');
  }

  const {
    website_url,
    strategy_plan,
    website_analysis: existingWebsiteAnalysis,
    business_name,
    goal,
    geo_include,
    budget_monthly_ils,
    management_percentage,
    budget_currency,
    business_type,
  } = settings;

  const oldStrategyPlan = strategy_plan as Record<string, unknown>;

  const geoStr = Array.isArray(geo_include) ? (geo_include as string[]).join(', ') : (geo_include ?? 'global');
  const budgetDisplay = budget_currency === 'USD'
    ? `$${Math.round((budget_monthly_ils ?? 0) / 3.75 * (management_percentage ?? 100) / 100)}`
    : `₪${Math.round((budget_monthly_ils ?? 0) * (management_percentage ?? 100) / 100)}`;

  // ── 2. Parallel: scrape + historical data ─────────────────────────────────
  const [scrapeResult, historical] = await Promise.all([
    website_url
      ? scrapeWebsite(website_url).catch(() => null)
      : Promise.resolve(null),
    getAllHistoricalData(tenantId).catch(() => null),
  ]);

  let websiteText: string;
  if (scrapeResult && scrapeResult.confident) {
    websiteText = scrapeResult.text.slice(0, 8000);
  } else if (existingWebsiteAnalysis) {
    websiteText = `[LIVE SCRAPE FAILED — using cached website analysis]\n${String(existingWebsiteAnalysis).slice(0, 8000)}`;
  } else {
    websiteText = '[No website content available]';
  }

  // ── 3. Perplexity web research ────────────────────────────────────────────
  const perplexityPrompt =
    `Refresh competitive intelligence for: ${business_name ?? 'this business'}. ` +
    `Geography: ${geoStr}. Goal: ${goal ?? 'advertising'}.
Find: (1) new competitors or market changes in the past 6 months, (2) current CPC benchmarks, (3) new ad messaging trends in this category.`;

  let webIntelligence = '';
  try {
    const webRes = await route({
      task: 'web_research',
      prompt: perplexityPrompt,
      options: { maxTokens: 1200 },
    });
    webIntelligence = webRes.output;

    // Save Perplexity result to market_research_snapshots for audit trail
    await db.from('market_research_snapshots').insert({
      tenant_id: tenantId,
      query_type: 'strategy_refresh',
      query: perplexityPrompt,
      raw_findings: webRes.output,
    });
  } catch {
    // Perplexity failure is non-blocking — Claude proceeds without live data
    webIntelligence = '[Live market intelligence unavailable — proceeding with existing knowledge]';
  }

  // ── 4. Claude re-analysis ─────────────────────────────────────────────────
  const existingNarrative = [
    (oldStrategyPlan as any)?.strategy_narrative,
    (oldStrategyPlan as any)?.market_insights,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 3000);

  const analysisPrompt = `You are refreshing an existing advertising strategy. Compare what has changed.

EXISTING STRATEGY SUMMARY: ${existingNarrative || JSON.stringify(oldStrategyPlan).slice(0, 2000)}

NEW WEBSITE CONTENT: ${websiteText}

NEW MARKET INTELLIGENCE: ${webIntelligence}

Business context:
- Business name: ${business_name ?? 'unknown'}
- Business type: ${business_type ?? 'unknown'}
- Goal: ${goal ?? 'not specified'}
- Geography: ${geoStr}
- Monthly budget: ${budgetDisplay}
- Budget currency: ${budget_currency ?? 'ILS'}

Generate an updated strategy_plan JSON with the same structure as the original but reflecting current reality.
Focus on what CHANGED — note explicitly in strategy_narrative what is new vs. what remains valid.
Return ONLY valid JSON with the same fields as the original strategy_plan.`;

  let newStrategyPlan: Record<string, unknown>;
  try {
    const claudeRes = await route({
      task: 'analysis',
      prompt: analysisPrompt,
      options: { maxTokens: 3000, temperature: 0.3 },
    });

    const parsed = extractJsonFromText(claudeRes.output);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      newStrategyPlan = parsed as Record<string, unknown>;
    } else {
      // Graceful fallback: use the existing strategy plan unchanged
      newStrategyPlan = { ...oldStrategyPlan };
    }
  } catch {
    // AI failure: fall back to existing strategy plan
    newStrategyPlan = { ...oldStrategyPlan };
  }

  // ── 5. Compute delta ──────────────────────────────────────────────────────
  const changedFields = computeChangedFields(oldStrategyPlan, newStrategyPlan);
  const deltaSummary = buildDeltaSummary(changedFields, oldStrategyPlan, newStrategyPlan);

  // ── 6. Insert recommendation (does NOT auto-apply) ────────────────────────
  const { data: inserted, error: insertError } = await db
    .from('strategy_update_recommendations')
    .insert({
      tenant_id: tenantId,
      trigger_type: triggerType,
      trigger_summary: deltaSummary,
      strategy_changes: {
        old_strategy: oldStrategyPlan,
        new_strategy: newStrategyPlan,
        changed_fields: changedFields,
      },
      confidence: 75,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(
      `Failed to insert strategy_update_recommendation: ${insertError?.message ?? 'no row returned'}`,
    );
  }

  // ── 7. Audit log ──────────────────────────────────────────────────────────
  await db.from('audit_log').insert({
    tenant_id: tenantId,
    action: 'strategy.refresh_recommendation_created',
    actor: 'system',
    payload: {
      recommendation_id: inserted.id,
      trigger_type: triggerType,
      changed_fields: changedFields,
      confidence: 75,
    },
  });

  return { recommendationId: inserted.id };
}

// swot-generator.ts — Living SWOT analysis generator.
//
// Reads a tenant's strategy_plan, website_analysis, business_name, and latest
// market research snapshot, then calls the AI router to produce 8-12 SWOT items.
// Results are written atomically (delete + insert) to the living_swot table.
//
// Errors propagate to the caller — this service is intentionally thin.

import { route } from '@vigmis/ai-router';
import { db } from '@vigmis/db';

type SwotCategory = 'strength' | 'weakness' | 'opportunity' | 'threat';
type SwotImpact = 'low' | 'medium' | 'high';
type SwotOwner = 'strategy' | 'creative' | 'optimization' | 'website';

interface SwotItem {
  category: SwotCategory;
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
  impact: SwotImpact;
  recommended_action: string;
  owner: SwotOwner;
}

const SYSTEM_PROMPT = `You are a senior marketing strategist producing a structured SWOT analysis for a business. Your output feeds directly into a live dashboard — it must be honest, specific, and data-grounded. Every item must reference actual evidence from the strategy data provided, not generic platitudes.

Rules:
- Produce 8-12 items total, distributed across all four SWOT categories (at least 1 per category).
- Each item must be falsifiable: if we had more data, we could verify or disprove it.
- Evidence must be concrete data points lifted from the input, not restatements of the title.
- Confidence reflects how certain you are given the available data (0 = pure guess, 100 = strong evidence).
- Return ONLY valid JSON — no markdown fences, no explanation.`;

function buildPrompt(opts: {
  businessName: string;
  strategyPlan: unknown;
  websiteAnalysis: string | null;
  marketResearch: string | null;
}): string {
  const { businessName, strategyPlan, websiteAnalysis, marketResearch } = opts;

  const sections: string[] = [];

  sections.push(`BUSINESS: ${businessName || 'Unknown'}`);

  if (strategyPlan) {
    sections.push(`STRATEGY PLAN:\n${JSON.stringify(strategyPlan, null, 2).slice(0, 2000)}`);
  }

  if (websiteAnalysis) {
    sections.push(`WEBSITE ANALYSIS:\n${websiteAnalysis.slice(0, 1200)}`);
  }

  if (marketResearch) {
    sections.push(`MARKET RESEARCH (latest snapshot):\n${marketResearch.slice(0, 1200)}`);
  }

  return `${sections.join('\n\n')}

TASK: Generate a Living SWOT analysis for this business based on all the data above.

Return a JSON array of 8-12 objects. Each object must have exactly these fields:
{
  "category": "strength" | "weakness" | "opportunity" | "threat",
  "title": "3-6 word phrase",
  "description": "1-2 sentences explaining this item",
  "evidence": ["specific data point from the input", "another specific data point", "optional third point"],
  "confidence": <integer 0-100>,
  "impact": "low" | "medium" | "high",
  "recommended_action": "one specific, actionable next step",
  "owner": "strategy" | "creative" | "optimization" | "website"
}

Return ONLY the JSON array. No wrapper object, no markdown.`;
}

function parseSwotItems(raw: string): SwotItem[] {
  // Strip markdown code fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Try to find a JSON array or object in the response
    const arrayMatch = stripped.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      parsed = JSON.parse(arrayMatch[0]);
    } else {
      const objMatch = stripped.match(/\{[\s\S]*\}/);
      if (!objMatch) throw new Error('No JSON found in AI response');
      parsed = JSON.parse(objMatch[0]);
    }
  }

  // Accept array directly, or unwrap .items / .swot
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      items = obj.items;
    } else if (Array.isArray(obj.swot)) {
      items = obj.swot;
    } else {
      throw new Error('AI response object has no recognisable array field (items/swot)');
    }
  } else {
    throw new Error('AI response is neither an array nor an object');
  }

  const validCategories = new Set<string>(['strength', 'weakness', 'opportunity', 'threat']);
  const validImpacts = new Set<string>(['low', 'medium', 'high']);
  const validOwners = new Set<string>(['strategy', 'creative', 'optimization', 'website']);

  return items
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => {
      const category = String(item.category ?? '').toLowerCase();
      const impact = String(item.impact ?? 'medium').toLowerCase();
      const owner = String(item.owner ?? 'strategy').toLowerCase();
      const confidence = Math.min(100, Math.max(0, Math.round(Number(item.confidence ?? 70))));

      return {
        category: (validCategories.has(category) ? category : 'strength') as SwotCategory,
        title: String(item.title ?? '').slice(0, 120),
        description: String(item.description ?? '').slice(0, 500),
        evidence: Array.isArray(item.evidence)
          ? (item.evidence as unknown[]).map((e) => String(e)).slice(0, 3)
          : [],
        confidence,
        impact: (validImpacts.has(impact) ? impact : 'medium') as SwotImpact,
        recommended_action: String(item.recommended_action ?? '').slice(0, 500),
        owner: (validOwners.has(owner) ? owner : 'strategy') as SwotOwner,
      };
    })
    .filter((item) => item.title.length > 0);
}

export async function generateAndSaveSwot(tenantId: string): Promise<SwotItem[]> {
  // 1. Read client_settings
  const { data: settings, error: settingsError } = await db
    .from('client_settings')
    .select('strategy_plan, website_analysis, business_name')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (settingsError) throw settingsError;

  // 2. Fetch latest market research snapshot
  const { data: snapshot, error: snapshotError } = await db
    .from('market_research_snapshots')
    .select('raw_findings')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) throw snapshotError;

  const prompt = buildPrompt({
    businessName: String((settings as any)?.business_name ?? ''),
    strategyPlan: (settings as any)?.strategy_plan ?? null,
    websiteAnalysis: (settings as any)?.website_analysis ?? null,
    marketResearch: (snapshot as any)?.raw_findings ?? null,
  });

  // 3. Call AI router
  const response = await route({
    task: 'analysis',
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    options: { maxTokens: 3000, temperature: 0.3, tenantId },
  });

  // 4. Parse items
  const items = parseSwotItems(response.output);

  if (items.length === 0) {
    throw new Error('AI returned zero valid SWOT items');
  }

  // Ensure at least one item per quadrant to prevent empty grid columns.
  const categories: SwotCategory[] = ['strength', 'weakness', 'opportunity', 'threat'];
  for (const cat of categories) {
    if (!items.some(i => i.category === cat)) {
      items.push({
        category: cat,
        title: 'Insufficient data',
        description: 'Not enough data to identify a specific item in this category.',
        evidence: [],
        confidence: 20,
        impact: 'low',
        recommended_action: 'Gather more data and refresh the analysis.',
        owner: 'strategy',
      });
    }
  }

  // 5. Delete existing rows for this tenant
  const { error: deleteError } = await db
    .from('living_swot')
    .delete()
    .eq('tenant_id', tenantId);

  if (deleteError) throw deleteError;

  // 6. Insert new rows
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    tenant_id: tenantId,
    category: item.category,
    title: item.title,
    description: item.description,
    evidence: item.evidence,
    confidence: item.confidence,
    impact: item.impact,
    recommended_action: item.recommended_action,
    owner: item.owner,
    created_at: now,
    updated_at: now,
  }));

  const { error: insertError } = await db.from('living_swot').insert(rows);

  if (insertError) throw insertError;

  console.log(
    `[swot-generator] tenant=${tenantId} generated ${items.length} SWOT items`,
  );

  return items;
}

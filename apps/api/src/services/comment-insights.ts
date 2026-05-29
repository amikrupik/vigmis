// Comment Insights — mines recurring patterns from the comment stream.
//
// Tagging individual comments is cheap (Session 6.1 does that). The hard part
// is noticing that 12 different customers asked basically the same question
// over 2 weeks — that's a FAQ candidate, not 12 isolated questions.
//
// This service:
//   1. Pulls recent comments by sentiment category
//   2. Asks the LLM to cluster them into themes
//   3. Persists the top themes as `comment_insights` rows
//   4. For "recurring_objection" themes, feeds them into creative_briefs as
//      candidate objections-to-kill
//
// Output is surfaced in:
//   - Dashboard "Insights" panel
//   - Weekly briefings (decision section)
//   - Creative-brief refresh (objection_to_kill)

import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import type { Sentiment } from './social-comments.js';
import { isThrottled } from './usage.js';

const MIN_OCCURRENCE_FOR_INSIGHT = 3;       // need ≥3 examples to count as recurring
const MAX_COMMENTS_PER_RUN = 200;

interface CommentRow {
  id: string;
  text: string;
  sentiment: Sentiment;
  commented_at: string;
}

interface ClusteredInsight {
  kind: 'recurring_objection' | 'recurring_question' | 'recurring_complaint' | 'praise_theme' | 'feature_request' | 'faq_candidate';
  theme: string;
  example_comment_ids: string[];
  occurrence_count: number;
  suggested_action: string;
}

const CLUSTERING_PROMPT = `You are a customer-insights analyst. Given recent comments on a business's social posts, find the RECURRING themes — questions/objections/complaints that come up multiple times.

Output STRICT JSON, no markdown fences:
{
  "themes": [
    {
      "kind": "recurring_objection" | "recurring_question" | "recurring_complaint" | "praise_theme" | "feature_request" | "faq_candidate",
      "theme": "<short label, 2-6 words>",
      "example_comment_ids": ["uuid", "uuid"],
      "occurrence_count": <int>,
      "suggested_action": "<one sentence — what should the business do about this>"
    }
  ]
}

Rules:
- Only include themes with at least 3 examples.
- Skip one-offs.
- "recurring_question" + ≥5 occurrences → also tag as "faq_candidate".
- example_comment_ids must come from the input comments only. NEVER make up UUIDs.
- "suggested_action" should be concrete:
  - For objection: "Add a paragraph to product page addressing X" or "Update creative brief objection_to_kill with X"
  - For question: "Add to FAQ on website: <question→answer>"
  - For complaint: specific fix
  - For praise: "Use this angle in future ads"
- Output at most 6 themes — the most-recurring ones.
- Empty themes array is valid (no patterns found).`;

export async function mineInsightsForTenant(tenantId: string): Promise<{
  themes_found: number;
  themes_persisted: number;
}> {
  // Pull recent comments (last 30 days) by ID + text + sentiment
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: comments } = await db.from('social_comments')
    .select('id, text, sentiment, commented_at')
    .eq('tenant_id', tenantId)
    .gte('commented_at', since)
    .order('commented_at', { ascending: false })
    .limit(MAX_COMMENTS_PER_RUN);

  if (!comments || comments.length < MIN_OCCURRENCE_FOR_INSIGHT) {
    return { themes_found: 0, themes_persisted: 0 };
  }

  // Format for the LLM. We send raw text + the actual ID so the model returns
  // real comment IDs we can store.
  const formatted = (comments as CommentRow[])
    .filter((c) => c.sentiment !== 'spam' && c.sentiment !== 'troll')
    .slice(0, MAX_COMMENTS_PER_RUN)
    .map((c) => `[${c.id}] (${c.sentiment}) ${c.text.slice(0, 200)}`)
    .join('\n');

  let raw: string;
  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: CLUSTERING_PROMPT,
      prompt: formatted,
      options: { temperature: 0.3, maxTokens: 1400, tenantId },
    });
    raw = res.output;
  } catch {
    return { themes_found: 0, themes_persisted: 0 };
  }

  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: { themes: ClusteredInsight[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { themes_found: 0, themes_persisted: 0 };
  }
  if (!parsed?.themes || !Array.isArray(parsed.themes)) {
    return { themes_found: 0, themes_persisted: 0 };
  }

  // Validate IDs against actual comments
  const validIds = new Set(comments.map((c: { id: string }) => c.id));
  const validThemes = parsed.themes.filter((t) => {
    if (!t.example_comment_ids || !Array.isArray(t.example_comment_ids)) return false;
    const real = t.example_comment_ids.filter((id) => validIds.has(id));
    if (real.length < MIN_OCCURRENCE_FOR_INSIGHT) return false;
    t.example_comment_ids = real;
    t.occurrence_count = real.length;
    return true;
  });

  // Persist as comment_insights rows. We REPLACE existing insights for this
  // tenant — insights are derived state, not historical record.
  const now = new Date().toISOString();
  for (const theme of validThemes) {
    const firstSeen = (comments as CommentRow[])
      .filter((c) => theme.example_comment_ids.includes(c.id))
      .map((c) => c.commented_at)
      .sort()[0] ?? now;
    const lastSeen = (comments as CommentRow[])
      .filter((c) => theme.example_comment_ids.includes(c.id))
      .map((c) => c.commented_at)
      .sort()
      .at(-1) ?? now;

    await db.from('comment_insights').insert({
      tenant_id: tenantId,
      insight_kind: theme.kind,
      theme: theme.theme,
      example_comments: theme.example_comment_ids,
      occurrence_count: theme.occurrence_count,
      first_seen_at: firstSeen,
      last_seen_at: lastSeen,
      suggested_action: theme.suggested_action,
    }).then(() => null, () => null);
  }

  return {
    themes_found: parsed.themes.length,
    themes_persisted: validThemes.length,
  };
}

/**
 * Cron — runs daily, mines insights for tenants with new comments since
 * the last run.
 */
export async function dispatchInsightsCron(): Promise<{ tenants: number; themes: number }> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: tenants } = await db.from('social_comments')
    .select('tenant_id')
    .gte('commented_at', since);
  const unique = [...new Set((tenants ?? []).map((t: { tenant_id: string }) => t.tenant_id))];

  let totalThemes = 0;
  let processed = 0;
  for (const t of unique) {
    if (await isThrottled(t).catch(() => false)) continue; // degrade/freeze → skip non-essential
    const r = await mineInsightsForTenant(t).catch(() => ({ themes_persisted: 0 }));
    totalThemes += r.themes_persisted;
    processed++;
  }
  return { tenants: processed, themes: totalThemes };
}

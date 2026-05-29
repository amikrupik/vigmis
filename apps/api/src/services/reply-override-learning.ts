// Human Override Learning — turns customer edits into brand-voice refinements.
//
// Each time the customer edits an AI-drafted reply before sending, the diff
// goes into `reply_override_log`. After enough samples (and after enough non-
// trivial edits), this service analyzes the pattern and proposes updates to
// the customer's brand_voice_profile:
//   - words/phrases the human consistently REMOVED → add to lexicon_avoid
//   - words/phrases the human consistently ADDED → add to lexicon_preferred
//   - sentence-rhythm shifts (longer/shorter) → update sentence_rhythm
//
// This is the single highest-signal feedback we get on brand voice — humans
// don't lie when they're fixing their own customer-facing copy.

import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import type { BrandVoiceProfile } from './brand-voice.js';

// Don't try to learn from trivial typo fixes — only substantive rewrites.
// Threshold: edit distance > 8 OR > 25% of draft length.
const MIN_EDIT_DISTANCE = 8;
const MIN_EDIT_RATIO = 0.25;
const MIN_OVERRIDES_TO_LEARN = 10;

interface OverrideRow {
  ai_draft: string;
  human_final: string;
  edit_distance: number;
}

const LEARN_PROMPT = `You are a brand voice analyst. You are given pairs of AI-drafted replies (BEFORE) and the human edits (AFTER). The human is the brand owner. They edited the AI drafts because the drafts didn't sound right.

Your job: identify the PATTERN of corrections — what does the human consistently change? Then propose refinements to the brand voice profile.

Output STRICT JSON, no markdown fences:
{
  "lexicon_add_to_preferred": ["term1", "term2"],   // words/phrases the human consistently ADDS
  "lexicon_add_to_avoid": ["term1", "term2"],        // words/phrases the human consistently REMOVES
  "rhythm_signal": "shorter" | "longer" | "no_change",
  "formality_signal": "more_formal" | "more_informal" | "no_change",
  "emoji_signal": "more" | "less" | "no_change",
  "summary": "<one-sentence description of what the human is consistently fixing>",
  "confidence": <0..1>
}

Rules:
- Only propose changes you see in at least 30% of the samples. Don't infer from one example.
- Don't include product-specific terms (e.g. "iPhone 17") in either list — focus on stylistic words.
- If samples don't show a clear pattern (or there are too few), set confidence < 0.5 and leave arrays empty.`;

export interface OverrideLearningResult {
  learned: boolean;
  reason: string;
  samples_analyzed: number;
  proposal?: {
    lexicon_add_to_preferred: string[];
    lexicon_add_to_avoid: string[];
    rhythm_signal: 'shorter' | 'longer' | 'no_change';
    formality_signal: 'more_formal' | 'more_informal' | 'no_change';
    emoji_signal: 'more' | 'less' | 'no_change';
    summary: string;
    confidence: number;
  };
  profile_updated?: boolean;
}

export async function learnFromOverridesForTenant(
  tenantId: string,
  opts: { lookbackDays?: number; autoApply?: boolean } = {},
): Promise<OverrideLearningResult> {
  const lookback = opts.lookbackDays ?? 30;
  const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await db.from('reply_override_log')
    .select('ai_draft, human_final, edit_distance')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(60);

  if (!rows || rows.length === 0) {
    return { learned: false, reason: 'no_overrides_in_window', samples_analyzed: 0 };
  }

  // Filter to substantive edits only — typo fixes are noise.
  const substantive = (rows as OverrideRow[]).filter((r) => {
    const draftLen = r.ai_draft.length;
    if (draftLen === 0) return false;
    const ratio = (r.edit_distance ?? 0) / draftLen;
    return r.edit_distance >= MIN_EDIT_DISTANCE || ratio >= MIN_EDIT_RATIO;
  });

  if (substantive.length < MIN_OVERRIDES_TO_LEARN) {
    return {
      learned: false,
      reason: `not_enough_substantive_overrides (have ${substantive.length}, need ${MIN_OVERRIDES_TO_LEARN})`,
      samples_analyzed: substantive.length,
    };
  }

  // Build the LLM prompt
  const samples = substantive.slice(0, 20).map((r, i) =>
    `--- Sample ${i + 1} ---\nBEFORE: ${r.ai_draft}\nAFTER:  ${r.human_final}`,
  ).join('\n\n');

  let raw: string;
  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: LEARN_PROMPT,
      prompt: samples,
      options: { temperature: 0.2, maxTokens: 600, tenantId },
    });
    raw = res.output;
  } catch {
    return { learned: false, reason: 'llm_unavailable', samples_analyzed: substantive.length };
  }

  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let proposal: OverrideLearningResult['proposal'];
  try {
    proposal = JSON.parse(cleaned);
  } catch {
    return { learned: false, reason: 'parse_error', samples_analyzed: substantive.length };
  }

  if (!proposal || proposal.confidence < 0.5) {
    return {
      learned: true,
      reason: `low_confidence (${proposal?.confidence ?? 0}) — no profile update`,
      samples_analyzed: substantive.length,
      proposal,
    };
  }

  if (!opts.autoApply) {
    return {
      learned: true,
      reason: 'proposal_ready (autoApply=false)',
      samples_analyzed: substantive.length,
      proposal,
      profile_updated: false,
    };
  }

  // Apply: merge into brand_voice_profile.
  const { data: settings } = await db.from('client_settings')
    .select('brand_voice_profile')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const current = (settings?.brand_voice_profile as BrandVoiceProfile | null) ?? null;
  if (!current) {
    return {
      learned: true,
      reason: 'no_base_profile_to_merge_into',
      samples_analyzed: substantive.length,
      proposal,
      profile_updated: false,
    };
  }

  const merged: BrandVoiceProfile = {
    ...current,
    lexicon_preferred: dedupe([...current.lexicon_preferred, ...proposal.lexicon_add_to_preferred]),
    lexicon_avoid: dedupe([...current.lexicon_avoid, ...proposal.lexicon_add_to_avoid]),
    sentence_rhythm:
      proposal.rhythm_signal === 'shorter' ? 'short_punchy'
      : proposal.rhythm_signal === 'longer' ? 'long_flowing'
      : current.sentence_rhythm,
    emoji_policy:
      proposal.emoji_signal === 'more' ? 'frequent'
      : proposal.emoji_signal === 'less' ? 'sparing'
      : current.emoji_policy,
    formality:
      proposal.formality_signal === 'more_formal' ? 'formal'
      : proposal.formality_signal === 'more_informal' ? 'informal'
      : current.formality,
  };

  await db.from('client_settings').update({
    brand_voice_profile: merged,
    brand_voice_extracted_at: new Date().toISOString(),
    brand_voice_source: 'mixed',  // marker that overrides have been merged
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId);

  return {
    learned: true,
    reason: 'profile_merged',
    samples_analyzed: substantive.length,
    proposal,
    profile_updated: true,
  };
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = s.trim().toLowerCase();
    if (k.length === 0 || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}

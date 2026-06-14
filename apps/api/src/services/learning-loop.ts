// Learning Loop — builds a client-specific memory of what works.
//
// Triggered on every creative approval. Extracts the winning patterns from
// the approved brief and stores them in client_settings.winning_patterns.
// The Creative Director reads these patterns on the next generation to
// avoid reinventing what already worked for this specific client.
//
// This is the compounding advantage: a client's 10th creative benefits from
// everything learned from their first 9 approved creatives.
//
// Stored in client_settings.winning_patterns as:
// {
//   "avatar": [WinningPattern, ...],
//   "image": [WinningPattern, ...],
//   "cinematic": [WinningPattern, ...],
//   "animation": [WinningPattern, ...]
// }
// Max 5 patterns per creative type (oldest replaced when full).

import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';

type CreativeType = 'avatar' | 'cinematic' | 'animation' | 'image';

export interface WinningPattern {
  openingHook: string;       // the opening line or visual hook that worked
  keyMessage: string;        // the core message / value prop angle
  ctaStyle: string;          // how the CTA was framed
  visualStyle?: string;      // for image/video: dominant visual language
  reviewBoardScore?: number; // average score across reviewers (0–1)
  revisionCount: number;     // 0 = approved on first try (strong signal)
  approvedAt: string;        // ISO timestamp
}

const MAX_PATTERNS_PER_TYPE = 5;

// Extract the learnable structure from an approved brief using Claude.
async function extractPatternFromBrief(
  type: CreativeType,
  brief: string,
): Promise<Omit<WinningPattern, 'reviewBoardScore' | 'revisionCount' | 'approvedAt'> | null> {
  const isVideo = type === 'avatar' || type === 'cinematic' || type === 'animation';

  try {
    const res = await route({
      task: 'analysis',
      prompt: `Extract the key creative patterns from this approved ${type} brief.
The brief was reviewed by a panel and approved by the client — it works.

BRIEF:
${brief.slice(0, 800)}

Extract and return this JSON (no markdown, no commentary):
{
  "openingHook": "<the first sentence or visual hook — max 20 words>",
  "keyMessage": "<the core value proposition angle used — max 25 words>",
  "ctaStyle": "<how the call-to-action was framed — max 15 words>",
  "visualStyle": ${isVideo ? '"<dominant visual/emotional style for this video type — max 20 words>"' : '"<primary visual style — color, mood, layout approach — max 20 words>"'}
}`,
      options: { maxTokens: 300, temperature: 0.1 },
    });

    const jsonMatch = res.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
    return {
      openingHook: parsed.openingHook ?? '',
      keyMessage: parsed.keyMessage ?? '',
      ctaStyle: parsed.ctaStyle ?? '',
      visualStyle: parsed.visualStyle ?? undefined,
    };
  } catch {
    return null;
  }
}

// Append a new pattern to the existing list, maintaining the max cap.
function appendPattern(
  existing: WinningPattern[],
  newPattern: WinningPattern,
): WinningPattern[] {
  const updated = [...existing, newPattern];
  // Keep only the most recent MAX_PATTERNS_PER_TYPE
  return updated.slice(-MAX_PATTERNS_PER_TYPE);
}

// Main entry: call this after a creative is approved.
export async function recordApprovedCreative(
  tenantId: string,
  jobId: string,
  creativeType: CreativeType,
  brief: Record<string, any>,
  revisionNumber: number,
  reviewBoardIterations: number,
): Promise<void> {
  // Extract the text brief for analysis
  const briefText: string = typeof brief.script === 'string'
    ? brief.script
    : typeof brief.prompt === 'string'
    ? brief.prompt
    : JSON.stringify(brief).slice(0, 800);

  if (!briefText.trim()) return;

  // Extract learnable pattern
  const extracted = await extractPatternFromBrief(creativeType, briefText);
  if (!extracted) return;

  const pattern: WinningPattern = {
    ...extracted,
    reviewBoardScore: reviewBoardIterations > 0
      ? Math.max(0.5, 1 - (reviewBoardIterations - 1) * 0.15)  // heuristic: fewer rounds = better
      : undefined,
    revisionCount: revisionNumber,
    approvedAt: new Date().toISOString(),
  };

  // Load existing patterns
  const { data: settings } = await db
    .from('client_settings')
    .select('winning_patterns')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const existing: Partial<Record<CreativeType, WinningPattern[]>> = ((settings as any)?.winning_patterns as Partial<Record<CreativeType, WinningPattern[]>> | null | undefined) ?? {};
  const typePatterns = existing[creativeType] ?? [];
  const updated = {
    ...existing,
    [creativeType]: appendPattern(typePatterns, pattern),
  };

  await db
    .from('client_settings')
    .update({ winning_patterns: updated, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);

  console.log(`[learning-loop] recorded pattern for tenant=${tenantId} type=${creativeType} revisions=${revisionNumber}`);
}

// Format winning patterns for injection into Creative Director context.
// Called by extractCreativeContext to load prior wins.
export function formatWinningPatternsForContext(
  winningPatterns: Record<string, WinningPattern[]> | null | undefined,
  type: CreativeType,
): string {
  if (!winningPatterns) return '';
  const patterns = winningPatterns[type] ?? [];
  if (!patterns.length) return '';

  const recentPatterns = patterns.slice(-3); // use last 3 most recent wins

  const lines = [
    `\nPREVIOUS WINNING PATTERNS FOR THIS CLIENT (${type} — approved by client):`,
  ];

  for (const p of recentPatterns) {
    lines.push(`  • Opening hook: "${p.openingHook}"`);
    lines.push(`    Key message: "${p.keyMessage}" | CTA: "${p.ctaStyle}"`);
    if (p.visualStyle) lines.push(`    Visual: ${p.visualStyle}`);
    if (p.revisionCount === 0) lines.push(`    (Approved first try — strong signal)`);
    lines.push('');
  }

  lines.push('Use these as inspiration and calibration. Iterate on what already worked, not from scratch.');

  return lines.join('\n');
}

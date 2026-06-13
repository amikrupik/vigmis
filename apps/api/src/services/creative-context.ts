// Creative Context — structured extraction of all strategic intelligence
// needed before generating any creative asset.
//
// Sources (in priority order):
//   1. strategy_plan.creative_brief_extended — richest, AI-generated agency panel
//   2. creative_briefs table — pain/promise/proof/objection arc
//   3. strategy_plan.target_audience + market_insights — audience grounding
//   4. brand_voice_profile — tone/formality/lexicon rules
//
// The resulting CreativeContext is compact and injected as structured data
// into the Creative Director prompt. Never dump raw JSONB into a prompt.

import { db } from '@vigmis/db';
import type { StrategyPlan } from '@vigmis/db';
import { getDefaultBrief } from './creative-brief.js';
import type { CreativeBrief } from './creative-brief.js';
import type { BrandVoiceProfile } from './brand-voice.js';

export interface CreativeContext {
  // Audience
  targetAudience: string;
  corePain: string;
  // Promise
  corePromise: string;
  positioning: string;
  proofPoints: string;
  // Barriers
  objections: string;
  // Offer / CTA
  offer: string;
  // Voice guard rails
  brandVoice: string;
  toneAdjectives: string[];
  forbiddenClaims: string[];
  forbiddenAngles: string[];
  // Hooks
  emotionalHook: string;
  rationalHook: string;
  // Platform context
  platform: string;
  format: string;
  // Brand identity
  brandName: string;
  websiteUrl: string;
  // Extended brief data (optional — present when creative_brief_extended exists)
  messagingPillars?: Array<{
    pillar: string;
    headline: string;
    hook: string;
    body: string;
    cta: string;
  }>;
  existingConcepts?: Array<{
    type: string;
    concept: string;
    script: string;
    rationale: string;
  }>;
  platformHooks?: {
    google?: string[];
    meta?: string[];
    tiktok?: string[];
  };
}

export async function extractCreativeContext(
  tenantId: string,
  strategyPlan: StrategyPlan | null,
  brandVoice: BrandVoiceProfile | null,
  platform: string,
  format: string,
  brandName: string,
  websiteUrl: string,
): Promise<CreativeContext> {
  // Fetch the creative brief (separate table — pain/promise/proof/objection)
  const brief: CreativeBrief | null = await getDefaultBrief(tenantId).catch(() => null);

  const extended = strategyPlan?.creative_brief_extended ?? null;

  // ── Target audience ───────────────────────────────────────────────────────
  const targetAudience =
    strategyPlan?.target_audience
    ?? brief?.audience_pain?.split(' — ')[0]
    ?? 'business owners and marketing managers';

  // ── Core pain ─────────────────────────────────────────────────────────────
  const corePain =
    brief?.audience_pain
    ?? strategyPlan?.market_insights?.slice(0, 300)
    ?? 'managing marketing effectively without wasting budget';

  // ── Core promise ──────────────────────────────────────────────────────────
  const corePromise =
    brief?.promise
    ?? extended?.messaging_pillars?.[0]?.body
    ?? `${brandName} helps ${targetAudience} get measurable results`;

  // ── Positioning ───────────────────────────────────────────────────────────
  const positioning =
    strategyPlan?.strategy_narrative
    ?? extended?.messaging_pillars?.[0]?.headline
    ?? '';

  // ── Proof points ─────────────────────────────────────────────────────────
  const proofPoints = brief?.proof ?? '';

  // ── Objections ───────────────────────────────────────────────────────────
  const objections = brief?.objection_to_kill ?? '';

  // ── Offer / CTA ───────────────────────────────────────────────────────────
  const offer =
    extended?.messaging_pillars?.find(p => p.cta)?.cta
    ?? brief?.rational_hook
    ?? `Learn more at ${websiteUrl}`;

  // ── Brand voice ───────────────────────────────────────────────────────────
  const toneAdjectives = brandVoice?.tone ?? ['professional', 'direct', 'human'];
  const brandVoiceDesc = brandVoice
    ? `${brandVoice.tone.join(', ')} — ${brandVoice.formality} — ${brandVoice.sentence_rhythm} sentences`
    : 'professional, direct, human — conversational, short sentences';

  const forbiddenClaims = brandVoice?.lexicon_avoid ?? [];
  const forbiddenAngles = [
    ...(brief?.forbidden_angles ?? []),
    ...(extended?.tone_guide?.avoid ?? []),
  ].filter(Boolean);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const emotionalHook =
    brief?.emotional_hook
    ?? extended?.messaging_pillars?.[0]?.hook
    ?? '';
  const rationalHook =
    brief?.rational_hook
    ?? extended?.messaging_pillars?.[1]?.hook
    ?? '';

  // ── Extended brief data ───────────────────────────────────────────────────
  const messagingPillars = extended?.messaging_pillars?.map(p => ({
    pillar: p.pillar,
    headline: p.headline,
    hook: p.hook,
    body: p.body,
    cta: p.cta,
  }));

  const existingConcepts = extended?.creative_concepts?.map(c => ({
    type: c.type,
    concept: c.concept,
    script: c.script,
    rationale: c.rationale,
  }));

  const platformHooks = extended?.hooks
    ? {
        google: extended.hooks.google,
        meta: extended.hooks.meta,
        tiktok: extended.hooks.tiktok,
      }
    : undefined;

  return {
    targetAudience,
    corePain,
    corePromise,
    positioning,
    proofPoints,
    objections,
    offer,
    brandVoice: brandVoiceDesc,
    toneAdjectives,
    forbiddenClaims,
    forbiddenAngles,
    emotionalHook,
    rationalHook,
    platform,
    format,
    brandName,
    websiteUrl,
    messagingPillars,
    existingConcepts,
    platformHooks,
  };
}

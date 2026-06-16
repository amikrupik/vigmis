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
import { formatWinningPatternsForContext } from './learning-loop.js';

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
  // Creative language — derived from campaign geo targeting
  creativeLanguage: string;
  creativeLanguageReason: string;
  // Learning Loop — prior winning patterns for this client
  winningPatternsContext?: string;
  // Hypothesis Engine — open testable hypotheses from Strategic Brain
  hypothesesContext?: string;
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

// ── Language detection ─────────────────────────────────────────────────────────
// Maps normalised geography strings → primary advertising language.
// Priority: audience minority signal > geo_include match > English fallback.

const GEO_LANGUAGE_MAP: Array<{ keys: string[]; name: string; code: string }> = [
  { keys: ['israel', ' il ', 'יש'], name: 'Hebrew', code: 'he' },
  { keys: ['germany', 'deutschland', 'österreich', 'austria', 'schweiz', 'german-speaking'], name: 'German', code: 'de' },
  { keys: ['france', 'french-speaking', 'francophone'], name: 'French', code: 'fr' },
  { keys: ['spain', 'españa', 'mexico', 'colombia', 'argentina', 'chile', 'peru', 'venezuela', 'latin america'], name: 'Spanish', code: 'es' },
  { keys: ['brazil', 'brasil', 'portugal'], name: 'Portuguese', code: 'pt' },
  { keys: ['italy', 'italia', 'italian'], name: 'Italian', code: 'it' },
  { keys: ['netherlands', 'holland', 'dutch', 'belgium', 'belgie', 'belgique'], name: 'Dutch', code: 'nl' },
  { keys: ['saudi', 'uae', 'emirates', 'egypt', 'jordan', 'iraq', 'kuwait', 'bahrain', 'qatar', 'oman', 'arab world', 'arabic world', 'arabic-speaking', 'mena'], name: 'Arabic', code: 'ar' },
  { keys: ['russia', 'ukraine', 'belarus', 'russian-speaking'], name: 'Russian', code: 'ru' },
  { keys: ['turkey', 'türkiye', 'turkish'], name: 'Turkish', code: 'tr' },
  { keys: ['poland', 'polish'], name: 'Polish', code: 'pl' },
  { keys: ['greece', 'greek', 'grecia'], name: 'Greek', code: 'el' },
  { keys: ['japan', 'japanese'], name: 'Japanese', code: 'ja' },
  { keys: ['south korea', 'korea', 'korean'], name: 'Korean', code: 'ko' },
  { keys: ['china', 'taiwan', 'hong kong', 'chinese'], name: 'Chinese', code: 'zh' },
  { keys: ['usa', 'united states', 'us ', ' us,', 'uk', 'united kingdom', 'england', 'australia', 'canada', 'new zealand', 'ireland', 'english-speaking'], name: 'English', code: 'en' },
];

const GLOBAL_SCOPE = ['global', 'worldwide', 'international', 'europe', 'north america', 'south america', 'asia', 'africa', 'middle east'];

export function deriveCreativeLanguage(
  geoInclude: string[],
  targetAudience: string,
): { language: string; languageCode: string; reason: string } {
  const geoStr = geoInclude.join(' ').toLowerCase();
  const audienceLower = targetAudience.toLowerCase();

  // 1. Minority language signal in target audience ("Spanish speakers in UK")
  for (const entry of GEO_LANGUAGE_MAP) {
    for (const key of entry.keys) {
      const kTrimmed = key.trim();
      if (audienceLower.includes(`${kTrimmed} speaker`) || audienceLower.includes(`${kTrimmed}-speaking`)) {
        return { language: entry.name, languageCode: entry.code, reason: `Target audience includes ${entry.name}-speaking users — native-language copy converts better` };
      }
    }
  }

  // 2. No geo → English
  if (!geoInclude.length) {
    return { language: 'English', languageCode: 'en', reason: 'No geographic targeting set — using English as default' };
  }

  // 3. Global scope signal → English
  for (const signal of GLOBAL_SCOPE) {
    if (geoStr.includes(signal)) {
      return { language: 'English', languageCode: 'en', reason: `Broad geographic scope (${geoInclude[0]}) — English maximises international reach` };
    }
  }

  // 4. Match primary geo against map
  for (const geo of geoInclude) {
    const geoLower = geo.toLowerCase();
    for (const entry of GEO_LANGUAGE_MAP) {
      if (entry.keys.some(k => geoLower.includes(k.trim()) || k.trim().includes(geoLower))) {
        return {
          language: entry.name,
          languageCode: entry.code,
          reason: `Campaign targets ${geo} — ${entry.name} reaches local audiences ~40% more effectively than English`,
        };
      }
    }
  }

  // 5. Fallback
  return { language: 'English', languageCode: 'en', reason: `Language not recognised for "${geoInclude[0]}" — defaulting to English` };
}

export async function extractCreativeContext(
  tenantId: string,
  strategyPlan: StrategyPlan | null,
  brandVoice: BrandVoiceProfile | null,
  platform: string,
  format: string,
  brandName: string,
  websiteUrl: string,
  languageOverride?: string,
): Promise<CreativeContext> {
  // Fetch the creative brief (separate table — pain/promise/proof/objection)
  const brief: CreativeBrief | null = await getDefaultBrief(tenantId).catch(() => null);

  // Fetch winning_patterns + hypotheses from Learning Loop and Hypothesis Engine
  const { data: settingsForPatterns } = await db
    .from('client_settings')
    .select('winning_patterns, hypotheses')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const winningPatterns = (settingsForPatterns as any)?.winning_patterns ?? null;
  const winningPatternsContext = formatWinningPatternsForContext(winningPatterns, format as 'avatar' | 'cinematic' | 'animation' | 'image') || undefined;

  // Inject open hypotheses from Hypothesis Engine
  const openHypotheses = ((settingsForPatterns as any)?.hypotheses ?? []).filter((h: any) => h.status === 'open') as Array<{ text: string; confidence: number }>;
  const hypothesesContext = openHypotheses.length > 0
    ? `\n\nOPEN HYPOTHESES TO TEST IN THIS CREATIVE:\n${openHypotheses.slice(0, 3).map(h => `  • ${h.text}`).join('\n')}\nIf your brief naturally aligns with one of these, lean into it.`
    : '';

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

  // ── Creative language ─────────────────────────────────────────────────────
  const geoInclude: string[] = (strategyPlan as any)?.geo_include ?? [];
  const { language: detectedLanguage, reason: detectedReason } = deriveCreativeLanguage(geoInclude, targetAudience);
  const creativeLanguage = languageOverride ?? detectedLanguage;
  const creativeLanguageReason = languageOverride
    ? `User selected ${languageOverride}`
    : detectedReason;

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
    creativeLanguage,
    creativeLanguageReason,
    messagingPillars,
    existingConcepts,
    platformHooks,
    winningPatternsContext,
    hypothesesContext: hypothesesContext || undefined,
  };
}

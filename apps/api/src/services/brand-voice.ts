// Brand Voice Profile — extract + apply.
//
// Extracts a "voice fingerprint" from the customer's existing copy (website
// analysis + past posts) and stores it on client_settings.brand_voice_profile.
// Every piece of AI-generated content is then checked against the profile.
//
// This is what makes Vigmis output sound like the customer rather than ChatGPT.

import { route } from '@vigmis/ai-router';
import { db } from '@vigmis/db';

export type Formality = 'informal' | 'semiformal' | 'formal';
export type SentenceRhythm = 'short_punchy' | 'medium' | 'long_flowing';
export type FrequencyPolicy = 'none' | 'sparing' | 'frequent';

export interface BrandVoiceProfile {
  tone: string[];
  formality: Formality;
  address_form: string;
  lexicon_preferred: string[];
  lexicon_avoid: string[];
  sentence_rhythm: SentenceRhythm;
  emoji_policy: FrequencyPolicy;
  humor_level: FrequencyPolicy;
  exclamation_policy: FrequencyPolicy;
  common_ctas: string[];
  language_primary: string;
  examples: string[];
}

const EXTRACTION_PROMPT = `You are a brand voice analyst. Given samples of a business's existing copy, extract a structured profile that captures HOW they write (not WHAT they sell).

Output STRICT JSON, no markdown fences:
{
  "tone": ["adjective1", "adjective2", "adjective3"],
  "formality": "informal" | "semiformal" | "formal",
  "address_form": "<the way they address the reader — 'אתה', 'אתם', 'את', 'you-casual', 'you-formal', 'we-inclusive', etc.>",
  "lexicon_preferred": ["term1", "term2", "term3"],
  "lexicon_avoid": ["term1", "term2"],
  "sentence_rhythm": "short_punchy" | "medium" | "long_flowing",
  "emoji_policy": "none" | "sparing" | "frequent",
  "humor_level": "none" | "light" | "frequent",
  "exclamation_policy": "none" | "sparing" | "frequent",
  "common_ctas": ["CTA1", "CTA2"],
  "language_primary": "<ISO 639-1 code: he, en, ar, ru, etc.>",
  "examples": ["short sample sentence 1", "short sample sentence 2"]
}

Rules:
- lexicon_preferred: words/phrases the brand actually USES (e.g. "handcrafted", "מתוקים", "boutique"). Not generic.
- lexicon_avoid: words/phrases they conspicuously DON'T use, OR competitor brand names, OR jargon a customer wouldn't recognize.
- examples: pick 2-3 ACTUAL phrases from the input (paraphrased lightly if needed to remove product-specific details). They should be voice-revealing.
- If the input doesn't show a clear signal for a field, make the most conservative inference rather than null. Always return all fields.`;

export interface ExtractionInput {
  websiteAnalysis?: string | null;
  pastPosts?: string[];        // body text of past posts, if any
  businessType?: string;
}

export async function extractBrandVoice(input: ExtractionInput): Promise<BrandVoiceProfile | null> {
  const samples: string[] = [];

  if (input.websiteAnalysis && input.websiteAnalysis.trim()) {
    samples.push(`--- WEBSITE COPY ---\n${input.websiteAnalysis.trim().slice(0, 4000)}`);
  }
  if (input.pastPosts && input.pastPosts.length > 0) {
    const postSection = input.pastPosts.slice(0, 30).join('\n\n---\n\n').slice(0, 4000);
    samples.push(`--- PAST POSTS ---\n${postSection}`);
  }

  if (samples.length === 0) return null;

  const prompt = [
    input.businessType ? `Business type: ${input.businessType}` : '',
    '',
    samples.join('\n\n'),
  ].join('\n');

  let raw: string;
  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: EXTRACTION_PROMPT,
      prompt,
      options: { temperature: 0.3, maxTokens: 700 },
    });
    raw = res.output;
  } catch {
    return null;
  }

  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.tone || !Array.isArray(parsed.tone)) return null;
    return parsed as BrandVoiceProfile;
  } catch {
    return null;
  }
}

/**
 * Build a brand-voice instruction block to prepend to any content-generation prompt.
 * Used by social-content, ad-copy, comment-reply generators.
 */
export function brandVoiceInstructions(profile: BrandVoiceProfile | null): string {
  if (!profile) return '';
  const lines = [
    `BRAND VOICE — match this exactly:`,
    `- Tone: ${profile.tone.join(', ')}`,
    `- Formality: ${profile.formality}`,
    `- Address the reader as: ${profile.address_form}`,
    `- Sentence rhythm: ${profile.sentence_rhythm}`,
    `- Emoji policy: ${profile.emoji_policy}`,
    `- Humor: ${profile.humor_level}`,
    `- Exclamation marks: ${profile.exclamation_policy}`,
  ];
  if (profile.lexicon_preferred.length > 0) {
    lines.push(`- Use these words/phrases when natural: ${profile.lexicon_preferred.join(', ')}`);
  }
  if (profile.lexicon_avoid.length > 0) {
    lines.push(`- NEVER use these words/phrases: ${profile.lexicon_avoid.join(', ')}`);
  }
  if (profile.common_ctas.length > 0) {
    lines.push(`- Preferred CTAs: ${profile.common_ctas.join(' | ')}`);
  }
  if (profile.examples.length > 0) {
    lines.push(`- Voice examples (match this style):`);
    profile.examples.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`));
  }
  return lines.join('\n');
}

/**
 * Fetch the stored profile for a tenant. Returns null if not yet extracted.
 */
export async function getBrandVoice(tenantId: string): Promise<BrandVoiceProfile | null> {
  const { data } = await db
    .from('client_settings')
    .select('brand_voice_profile')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data?.brand_voice_profile) return null;
  return data.brand_voice_profile as BrandVoiceProfile;
}

/**
 * Extract + persist. Use on demand or after onboarding completion.
 */
export async function refreshBrandVoiceForTenant(tenantId: string): Promise<BrandVoiceProfile | null> {
  const { data: settings } = await db
    .from('client_settings')
    .select('website_analysis, business_type')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { data: postsRaw } = await db
    .from('social_posts')
    .select('content')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(30);

  const profile = await extractBrandVoice({
    websiteAnalysis: settings?.website_analysis ?? null,
    pastPosts: (postsRaw ?? []).map((p: { content: string }) => p.content).filter(Boolean),
    businessType: settings?.business_type ?? undefined,
  });

  if (!profile) return null;

  await db.from('client_settings').update({
    brand_voice_profile: profile,
    brand_voice_extracted_at: new Date().toISOString(),
    brand_voice_source: (postsRaw?.length ?? 0) > 0 ? 'mixed' : 'website_crawl',
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId);

  return profile;
}

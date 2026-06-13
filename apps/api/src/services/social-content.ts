// Social content generation — text, hashtags, and image/video per platform + pillar

import OpenAI from 'openai';
import { route } from '@vigmis/ai-router';
import type { StrategyPlan } from '@vigmis/db';
import { scrapeWebsite } from './website-scraper.js';
import { classifyAndLog, PolicyBlockedError } from './policy-gate.js';
import { getBrandVoice, brandVoiceInstructions } from './brand-voice.js';
import { getDefaultBrief, briefInstructions } from './creative-brief.js';
import { verifyContent } from './truth-verifier.js';
import { getGeoContext } from './geo-context.js';

export interface SocialContentInput {
  tenantId: string;
  platform: 'facebook' | 'instagram' | 'tiktok';
  pillar: string;
  websiteUrl?: string;
  websiteAnalysis?: string | null;
  goal: string;
  strategyPlan?: StrategyPlan | null;
  brandVoice?: string;
  logoUrl?: string;
  /** Explicit content language from client_settings. 'auto' or undefined = detect from website. */
  contentLanguage?: string | null;
  brief?: {
    product?: string;
    message?: string;
    style?: string;
    cta?: string;
    restrictions?: string;
  } | null;
}

export interface SocialContentOutput {
  text: string;
  hashtags: string[];
  imageUrl?: string;
  videoUrl?: string;
}

const PILLAR_DESCRIPTIONS: Record<string, string> = {
  educational:       'Teach the audience something valuable about the industry or product category',
  promotional:       'Highlight an offer, product feature, or special deal with a clear call-to-action',
  social_proof:      'Share a testimonial, success story, review, or user-generated content angle',
  behind_the_scenes: 'Show the human side of the business — process, team, or how something is made',
  trending:          'Tap into a current trend, meme format, or timely conversation in the industry',
};

const PLATFORM_GUIDELINES: Record<string, string> = {
  facebook:  'Write 2–4 paragraphs, conversational tone, end with a clear CTA. Emojis sparingly.',
  instagram: 'Write an attention-grabbing first line, then 3–6 sentences. 20–25 hashtags at the end.',
  tiktok:    'Write a punchy hook (first 2 seconds), then a short 2–3 sentence caption. Trending tone, direct speech.',
};

// Heuristic language detection — looks at characters, not words, to avoid being
// fooled by English brand names sprinkled in a Hebrew/Arabic/Russian site.
function detectLanguage(text: string): { code: 'he' | 'ar' | 'ru' | 'en'; name: string } {
  if (/[֐-׿]/.test(text)) return { code: 'he', name: 'Hebrew' };
  if (/[؀-ۿ]/.test(text)) return { code: 'ar', name: 'Arabic' };
  if (/[Ѐ-ӿ]/.test(text)) return { code: 'ru', name: 'Russian' };
  return { code: 'en', name: 'English' };
}

function buildPrompt(input: SocialContentInput, websiteContent: string, contentSource: 'website' | 'strategy' = 'website'): string {
  const pillarDesc = PILLAR_DESCRIPTIONS[input.pillar] ?? input.pillar;
  const platformGuide = PLATFORM_GUIDELINES[input.platform];
  const audience = input.strategyPlan?.target_audience ?? 'general business audience';
  const voice = input.brandVoice ?? 'professional but approachable';
  const marketInsights = input.strategyPlan?.market_insights ?? '';

  // Use explicit content_language from settings if set; fall back to Unicode heuristic.
  const explicitLang = input.contentLanguage && input.contentLanguage !== 'auto'
    ? input.contentLanguage
    : null;
  const lang: { code: string; name: string } = explicitLang
    ? { code: explicitLang, name: explicitLang }
    : detectLanguage(websiteContent || '');

  // Build brief block if the user provided one-time context
  const briefLines: string[] = [];
  if (input.brief?.product)  briefLines.push(`Focus on this product/service: ${input.brief.product}`);
  if (input.brief?.message)  briefLines.push(`Key message: ${input.brief.message}`);
  if (input.brief?.style)    briefLines.push(`Style preference: ${input.brief.style}`);
  if (input.brief?.cta)      briefLines.push(`CTA to use: ${input.brief.cta}`);
  if (input.brief?.restrictions) briefLines.push(`Avoid: ${input.brief.restrictions}`);
  const briefBlock = briefLines.length > 0
    ? `\nONE-TIME BRIEF FROM CUSTOMER:\n${briefLines.join('\n')}\n`
    : '';

  const logoBlock = input.logoUrl
    ? `\nBRAND LOGO: The business has a logo at ${input.logoUrl}. When generating image prompts, always include the logo or brand name prominently. The AI image generation should incorporate the brand identity.\n`
    : '';

  const contentLabel = contentSource === 'strategy'
    ? 'BUSINESS CONTEXT (from strategy analysis — website is a JavaScript app that could not be scraped):'
    : 'ACTUAL WEBSITE CONTENT (use this — do not guess what the business does):';

  const insufficientRule = contentSource === 'strategy'
    ? `- You have strategy context above (audience, industry, goal, market insights). Generate the best post you can from this context. Only return {"text": "INSUFFICIENT_CONTENT", "hashtags": []} if there is literally zero information about the business or its industry.`
    : `- If the content above is empty or you cannot tell what the business sells, return {"text": "INSUFFICIENT_CONTENT", "hashtags": []} and stop.`;

  const productRef = contentSource === 'strategy'
    ? `<the full post copy in ${lang.name} — based on the business context and strategy above>`
    : `<the full post copy in ${lang.name} — reference the actual products/services from the website>`;

  return `You are a social media copywriter. Generate a ${input.platform} post for the following business.

LANGUAGE: write the post in ${lang.name}. The website is in ${lang.name} — the post MUST match. Do not switch languages. Hashtags can stay in English/transliteration when the platform expects it (Instagram), but the body text must be ${lang.name}.

${contentLabel}
${websiteContent || '(website content unavailable — see URL: ' + (input.websiteUrl ?? 'unknown') + ')'}

${marketInsights ? `MARKET INSIGHTS:\n${marketInsights.slice(0, 600)}\n` : ''}${briefBlock}${logoBlock}
Business goal: ${input.goal}
Target audience: ${audience}
Brand voice: ${voice}
Content pillar: ${input.pillar} — ${pillarDesc}
Platform format: ${platformGuide}

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "text": "${productRef}",
  "hashtags": ["<tag1>", "<tag2>", ...]
}

CALL-TO-ACTION RULE:
${input.brief?.cta
  ? `- END EVERY POST with this call-to-action: ${input.brief.cta}`
  : input.websiteUrl
    ? `- END EVERY POST with a call-to-action. Use the business website URL: ${input.websiteUrl}`
    : `- END EVERY POST with a call-to-action. Encourage the reader to contact the business (e.g. "DM us", "Contact us today", or similar).`}

Rules:
- The post MUST be relevant to the actual business described above. NEVER invent specific product names, prices, or claims not supported by the context.
- ${insufficientRule}
- hashtags must be without the # symbol
- For facebook: 3–5 hashtags
- For instagram: 20–25 hashtags
- For tiktok: 5–8 hashtags
- Do NOT include hashtags inside the text field; they go in the hashtags array only`;
}

async function fetchWebsiteContent(url: string): Promise<string> {
  // Use the proper multi-page scraper — extracts og + JSON-LD products too.
  const scraped = await scrapeWebsite(url);
  if (!scraped || !scraped.confident) return '';
  return scraped.text.slice(0, 4000);
}

async function generateImage(prompt: string): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[social-content] OPENAI_API_KEY not set — skipping image');
    return undefined;
  }

  try {
    const client = new OpenAI({ apiKey });
    const res = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });
    return res.data?.[0]?.url ?? undefined;
  } catch (err) {
    console.error('[social-content] DALL-E image generation failed:', err instanceof Error ? err.message : err);
    return undefined;
  }
}

function buildImagePrompt(input: SocialContentInput, postText: string): string {
  const audience = input.strategyPlan?.target_audience ?? 'general business';

  const logoInstruction = input.logoUrl
    ? ` Incorporate the brand identity — the brand logo can be found at ${input.logoUrl}; reference its colors and style.`
    : '';

  const ctaInstruction = input.brief?.cta
    ? ` Include a clear call-to-action text overlay reading: "${input.brief.cta}".`
    : input.websiteUrl
      ? ` Include a subtle call-to-action text overlay with the website: ${input.websiteUrl}.`
      : '';

  return `Professional marketing photo for a ${input.platform} post. Pillar: ${input.pillar}. Audience: ${audience}. Mood based on: "${postText.slice(0, 120)}". Clean, modern, bright.${logoInstruction}${ctaInstruction}`;
}

export async function generateSocialContent(input: SocialContentInput): Promise<SocialContentOutput> {
  // Prefer the stored AI analysis (richer, already extracted), fall back to live scrape if missing.
  const rawWebsiteContent =
    input.websiteAnalysis?.trim()
      ?? (input.websiteUrl ? await fetchWebsiteContent(input.websiteUrl) : '');

  let websiteContent = rawWebsiteContent;
  // Track whether we're using strategy_plan as the primary grounding source
  // (happens when website is a JS SPA that can't be scraped, like vigmis.com)
  let contentSource: 'website' | 'strategy' = rawWebsiteContent.length >= 200 ? 'website' : 'strategy';

  // Augment with strategy_plan context when available.
  // SPAs (Next.js, React) can't be scraped — strategy_narrative is authoritative.
  // Even when scraped content exists, strategy_plan adds product/audience context.
  if (input.strategyPlan) {
    const parts: string[] = [];
    if (input.strategyPlan.strategy_narrative) parts.push(input.strategyPlan.strategy_narrative);
    if (input.strategyPlan.market_insights) parts.push(input.strategyPlan.market_insights);
    if (input.strategyPlan.target_audience) parts.push(`Target audience: ${input.strategyPlan.target_audience}`);
    if (input.strategyPlan.recommendations) parts.push(input.strategyPlan.recommendations);
    const strategyText = parts.join('\n\n');
    websiteContent = rawWebsiteContent
      ? `${rawWebsiteContent}\n\n--- STRATEGY CONTEXT ---\n${strategyText}`
      : strategyText;
  }

  // Refuse to generate without grounding. Previous behavior was to confabulate
  // ("indoor plants" posts for a dates seller). Better to fail loudly.
  if (!websiteContent || websiteContent.length < 200) {
    throw new Error('INSUFFICIENT_WEBSITE_CONTENT: cannot generate post without real product data — re-run onboarding analysis or update the website URL.');
  }

  const basePrompt = buildPrompt(input, websiteContent, contentSource);
  // Prepend creative brief + brand voice instructions. Brief defines WHAT we say,
  // voice defines HOW we say it. Both are load-bearing — without them the output
  // is generic.
  const [brief, brandVoiceProfile] = await Promise.all([
    getDefaultBrief(input.tenantId).catch(() => null),
    getBrandVoice(input.tenantId).catch(() => null),
  ]);
  const briefBlock = briefInstructions(brief);
  const voiceBlock = brandVoiceInstructions(brandVoiceProfile);
  const prompt = [briefBlock, voiceBlock, basePrompt].filter(Boolean).join('\n\n');

  const aiResponse = await route({
    task: 'copywriting',
    prompt,
    options: { maxTokens: 800, temperature: 0.8 },
  });

  let text = '';
  let hashtags: string[] = [];

  // Strip markdown code fences — some models add them despite instructions.
  // Handles fences anywhere in the output, not just leading/trailing.
  let rawJson = aiResponse.output.trim();
  if (rawJson.includes('```')) {
    rawJson = rawJson
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
  }

  try {
    const parsed = JSON.parse(rawJson);
    text = parsed.text ?? '';
    hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  } catch {
    // Fallback 1: the output may contain a JSON object embedded in prose.
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        text = parsed.text ?? '';
        hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
      } catch {
        text = '';
      }
    }
    // Fallback 2: treat the (fence-stripped) output as plain text.
    if (!text) {
      text = rawJson;
      hashtags = [];
    }
  }

  // Defensive: never persist residual code fences into post content, even if a
  // model returned plain text wrapped in fences that slipped past the parse path.
  text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Honor the model's own honesty signal — also catches markdown-wrapped JSON fallback case
  if (text === 'INSUFFICIENT_CONTENT' || text.includes('"INSUFFICIENT_CONTENT"')) {
    throw new Error('INSUFFICIENT_WEBSITE_CONTENT: AI flagged the website content as too sparse — re-run onboarding analysis with a richer site.');
  }

  // Pre-flight policy gate — block before saving, before any image cost, before any platform call.
  // The classifier persists its decision to content_decisions for audit either way.
  // Pass geographic context so the classifier can apply per-country rules.
  const geo = await getGeoContext(input.tenantId).catch(() => null);
  const gate = await classifyAndLog({
    tenantId: input.tenantId,
    text,
    kind: 'post',
    source: 'pre_flight',
    market: geo?.primary_target ?? undefined,
    business_country: geo?.business_country ?? undefined,
  });
  if (gate.decision === 'block' || gate.decision === 'require_human_review') {
    throw new PolicyBlockedError(
      `POLICY_BLOCKED: ${gate.category} — ${gate.reason}`,
      gate,
    );
  }
  // If the classifier suggested a safer rewrite, prefer that.
  if (gate.decision === 'rewrite_suggested' && gate.suggested_rewrite) {
    text = gate.suggested_rewrite;
  }

  // Truth verifier — catches claims that contradict the customer's own site/store.
  // Different gate than policy: this is about FACTUAL contradictions, not legal ones.
  const truth = await verifyContent({
    tenantId: input.tenantId,
    contentText: text,
    contentKind: 'post',
  });
  const blockingTruthIssues = truth.contradictions.filter((c) => c.severity === 'block');
  if (blockingTruthIssues.length > 0) {
    const lines = blockingTruthIssues.map((c) => `- ${c.category}: "${c.claim}" vs ${c.observed}`);
    throw new Error(`TRUTH_VERIFICATION_FAILED: Generated post contradicts your business data.\n${lines.join('\n')}`);
  }

  let imageUrl: string | undefined;
  let videoUrl: string | undefined;

  if (input.platform === 'facebook' || input.platform === 'instagram') {
    const imgPrompt = buildImagePrompt(input, text);
    imageUrl = await generateImage(imgPrompt).catch(err => {
      console.warn('[social-content] Image generation failed, posting without image:', err?.message);
      return undefined;
    });
  }

  // TikTok video generation is asynchronous (HeyGen/Pika job queue).
  // The social_posts record stores video_url = null until the creative job completes.

  return { text, hashtags, imageUrl, videoUrl };
}

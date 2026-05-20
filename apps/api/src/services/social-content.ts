// Social content generation — text, hashtags, and image/video per platform + pillar

import OpenAI from 'openai';
import { route } from '@vigmis/ai-router';
import type { StrategyPlan } from '@vigmis/db';

export interface SocialContentInput {
  tenantId: string;
  platform: 'facebook' | 'instagram' | 'tiktok';
  pillar: string;
  websiteUrl?: string;
  goal: string;
  strategyPlan?: StrategyPlan | null;
  brandVoice?: string;
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

function buildPrompt(input: SocialContentInput, websiteContent: string): string {
  const pillarDesc = PILLAR_DESCRIPTIONS[input.pillar] ?? input.pillar;
  const platformGuide = PLATFORM_GUIDELINES[input.platform];
  const audience = input.strategyPlan?.target_audience ?? 'general business audience';
  const voice = input.brandVoice ?? 'professional but approachable';
  const marketInsights = input.strategyPlan?.market_insights ?? '';

  return `You are a social media copywriter. Generate a ${input.platform} post for the following business.

ACTUAL WEBSITE CONTENT (use this — do not guess what the business does):
${websiteContent || '(website content unavailable — see URL: ' + (input.websiteUrl ?? 'unknown') + ')'}

${marketInsights ? `MARKET INSIGHTS:\n${marketInsights.slice(0, 600)}\n` : ''}
Business goal: ${input.goal}
Target audience: ${audience}
Brand voice: ${voice}
Content pillar: ${input.pillar} — ${pillarDesc}
Platform format: ${platformGuide}

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "text": "<the full post copy — reference the actual products/services from the website>",
  "hashtags": ["<tag1>", "<tag2>", ...]
}

Rules:
- The post MUST be about the actual business above — its actual products, not a generic guess
- hashtags must be without the # symbol
- For facebook: 3–5 hashtags
- For instagram: 20–25 hashtags
- For tiktok: 5–8 hashtags
- Do NOT include hashtags inside the text field; they go in the hashtags array only`;
}

async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Vigmis/1.0 (Social Content Generation)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);
  } catch {
    return '';
  }
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
  return `Professional marketing photo for a ${input.platform} post. Pillar: ${input.pillar}. Audience: ${audience}. Mood based on: "${postText.slice(0, 120)}". Clean, modern, bright. No text overlays. No logos.`;
}

export async function generateSocialContent(input: SocialContentInput): Promise<SocialContentOutput> {
  const websiteContent = input.websiteUrl ? await fetchWebsiteContent(input.websiteUrl) : '';
  const prompt = buildPrompt(input, websiteContent);

  const aiResponse = await route({
    task: 'copywriting',
    prompt,
    options: { maxTokens: 800, temperature: 0.8 },
  });

  let text = '';
  let hashtags: string[] = [];

  try {
    const parsed = JSON.parse(aiResponse.output);
    text = parsed.text ?? '';
    hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  } catch {
    // Fallback: treat entire output as text
    text = aiResponse.output;
    hashtags = [];
  }

  let imageUrl: string | undefined;
  let videoUrl: string | undefined;

  if (input.platform === 'facebook' || input.platform === 'instagram') {
    const imgPrompt = buildImagePrompt(input, text);
    imageUrl = await generateImage(imgPrompt);
  }

  // TikTok video generation is asynchronous (HeyGen/Pika job queue).
  // The social_posts record stores video_url = null until the creative job completes.

  return { text, hashtags, imageUrl, videoUrl };
}

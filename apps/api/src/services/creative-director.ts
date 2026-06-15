// Creative Director AI — transforms a raw user brief into a production-ready
// creative brief that a world-class creative director would approve.
//
// Before this layer: "generate a marketing video for Vigmis"
// After this layer:  scene-by-scene production direction, specific hooks,
//                    natural avatar script with correct pronunciation,
//                    visual metaphors grounded in the audience's real pain
//
// Uses the `analysis` task type → Claude Sonnet.
// Failure is non-fatal: always returns something usable (falls back to user input).

import { route } from '@vigmis/ai-router';
import type { CreativeContext } from './creative-context.js';

type CreativeType = 'avatar' | 'cinematic' | 'animation' | 'image';

const SYSTEM_PROMPT = `You are a world-class creative director with 20 years of direct-response advertising. Your output becomes the exact prompt/script sent to a video or image AI generator.

RULES — non-negotiable:
- Start with the audience's SPECIFIC pain. Never start with the brand name.
- Be specific: "$47 per lead" beats "lower costs". "3 hours saved daily" beats "save time".
- Write like a real human talking to a friend. Use contractions. Short sentences.
- BANNED WORDS: cutting-edge, innovative, seamless, powerful, robust, revolutionize, leverage, synergy, game-changer, state-of-the-art, best-in-class
- Brand name must appear naturally inside a complete sentence — NEVER as a standalone prefix
- The hook must earn attention in under 2 seconds
- Every sentence must justify its presence`;

function formatContext(ctx: CreativeContext): string {
  const lines: string[] = [
    `TARGET AUDIENCE: ${ctx.targetAudience}`,
    `CORE PAIN: ${ctx.corePain}`,
    `CORE PROMISE: ${ctx.corePromise}`,
  ];
  if (ctx.positioning) lines.push(`POSITIONING: ${ctx.positioning}`);
  if (ctx.proofPoints) lines.push(`PROOF: ${ctx.proofPoints}`);
  if (ctx.objections) lines.push(`OBJECTION TO KILL: ${ctx.objections}`);
  if (ctx.emotionalHook) lines.push(`EMOTIONAL HOOK (first 2s): ${ctx.emotionalHook}`);
  if (ctx.rationalHook) lines.push(`RATIONAL HOOK: ${ctx.rationalHook}`);
  lines.push(`BRAND VOICE: ${ctx.brandVoice}`);
  lines.push(`OFFER / CTA: ${ctx.offer}`);
  lines.push(`PLATFORM: ${ctx.platform || 'general'}`);
  lines.push(`BRAND NAME: "${ctx.brandName}" — pronounce as ONE word, not initials`);
  if (ctx.websiteUrl) lines.push(`WEBSITE: ${ctx.websiteUrl}`);
  if (ctx.forbiddenAngles.length > 0) {
    lines.push(`FORBIDDEN ANGLES: ${ctx.forbiddenAngles.join(' | ')}`);
  }
  if (ctx.forbiddenClaims.length > 0) {
    lines.push(`FORBIDDEN WORDS: ${ctx.forbiddenClaims.slice(0, 8).join(', ')}`);
  }
  if (ctx.messagingPillars && ctx.messagingPillars.length > 0) {
    lines.push('\nMESSAGING PILLARS (use these angles):');
    ctx.messagingPillars.slice(0, 2).forEach(p => {
      lines.push(`  [${p.pillar}] headline: "${p.headline}" | hook: "${p.hook}"`);
    });
  }
  if (ctx.winningPatternsContext) {
    lines.push(ctx.winningPatternsContext);
  }
  if (ctx.hypothesesContext) {
    lines.push(ctx.hypothesesContext);
  }
  return lines.join('\n');
}

function avatarPrompt(ctx: CreativeContext, userInput: string): string {
  const existingConcept = ctx.existingConcepts?.find(c => c.type === 'avatar');
  const conceptHint = existingConcept
    ? `\nSTRATEGIC CONCEPT: "${existingConcept.concept}"\nReference script: "${existingConcept.script.slice(0, 200)}"\nWhy it wins: ${existingConcept.rationale}`
    : '';

  const platformHooks = ctx.platform === 'meta' ? ctx.platformHooks?.meta :
    ctx.platform === 'google' ? ctx.platformHooks?.google :
    ctx.platform === 'tiktok' ? ctx.platformHooks?.tiktok : null;
  const hooksHint = platformHooks?.length
    ? `\nSTRATEGIC HOOKS FOR ${ctx.platform?.toUpperCase()}: ${platformHooks.slice(0, 2).join(' | ')}`
    : '';

  return `${formatContext(ctx)}${conceptHint}${hooksHint}

USER REQUEST: "${userInput}"

Write a 30-45 second talking-head video SCRIPT (spoken aloud by an on-screen presenter).

SCRIPT RULES:
1. DO NOT start with the brand name "${ctx.brandName}" — open with pain, a question, or a bold statement
2. Embed "${ctx.brandName}" naturally mid-script: "That's why teams use ${ctx.brandName}" or "At ${ctx.brandName}, we built this for you"
3. Contractions required: you're, we've, it's, don't, that's
4. Maximum 15 words per sentence
5. Include one concrete detail (number, time, outcome) if available from the brief
6. End with direct CTA: "${ctx.offer}" — include ${ctx.websiteUrl || 'website URL'}
7. NO stage directions, NO [brackets], NO speaker labels — script text only

Output ONLY the script text.`;
}

function cinematicPrompt(ctx: CreativeContext, userInput: string): string {
  const existingConcept = ctx.existingConcepts?.find(c => c.type === 'cinematic');
  const conceptHint = existingConcept
    ? `\nSTRATEGIC CONCEPT: "${existingConcept.concept}"\nDirection: "${existingConcept.script.slice(0, 250)}"`
    : '';

  return `${formatContext(ctx)}${conceptHint}

USER REQUEST: "${userInput}"

Write a cinematic video production brief (1080p 16:9, 5-10 seconds, for ${ctx.platform || 'Meta/Google'}).

FORMAT — provide each section:
OPENING SHOT (0-2s): [specific visual that SHOWS the pain — not a person at a laptop]
MIDDLE (2-7s): [the transformation — specific before/after moment, NOT "solution revealed"]
END (7-10s): [brand reveal + CTA text overlay]
ON-SCREEN TEXT: [exact text strings at each timestamp — max 5 words each]
COLOR PALETTE: [2-3 specific hex or descriptive colors — tied to the emotional goal]
MOOD: [one sentence — what feeling should the viewer have 1 second after watching]
VISUAL METAPHOR: [one concrete concept representing "${ctx.corePromise}" — no stock office clichés]

Output ONLY the production brief in the FORMAT above. No explanations.`;
}

function animationPrompt(ctx: CreativeContext, userInput: string): string {
  const existingConcept = ctx.existingConcepts?.find(c => c.type === 'animation');
  const conceptHint = existingConcept
    ? `\nSTRATEGIC CONCEPT: "${existingConcept.concept}"\nDirection: "${existingConcept.script.slice(0, 250)}"`
    : '';

  return `${formatContext(ctx)}${conceptHint}

USER REQUEST: "${userInput}"

Write a motion graphics / animation brief (720p 9:16 vertical, 5-8 seconds, for ${ctx.platform || 'Instagram/TikTok'}).

FORMAT — provide each section:
FRAME 1 (0-1.5s): [HOOK — the pain in one visual or bold text — specific, not generic]
FRAME 2 (1.5-5s): [SOLUTION — animated concept showing the transformation — describe the motion]
FRAME 3 (5-7s): [PROOF POINT — one concrete claim as animated text]
FRAME 4 (7-8s): [CTA — website + action verb]
ANIMATION STYLE: [specific motion language — smooth slide-in, punchy cut, liquid morph, bounce, etc.]
COLOR PALETTE: [2-3 colors — matched to brand voice "${ctx.toneAdjectives.join(', ')}"]
TYPOGRAPHY: [font weight emphasis — where bold, where regular, any size contrast]

Output ONLY the animation brief in the FORMAT above.`;
}

function imagePrompt(ctx: CreativeContext, userInput: string): string {
  return `${formatContext(ctx)}

USER REQUEST: "${userInput}"

Write a DALL-E image generation prompt for a digital ad (1024x1024, ${ctx.platform || 'Meta/Google'}).

The prompt must produce an image that immediately communicates "${ctx.corePain}" and "${ctx.corePromise}" without showing:
- generic laptop/dashboard scenes
- handshakes or business meetings
- stock-photo diversity shots

PROMPT REQUIREMENTS:
1. Start with the main visual subject — specific, concrete, not generic
2. Specify the exact mood/emotion the viewer should feel
3. Include color palette guidance (2-3 specific colors)
4. Add composition note (rule of thirds, centered, diagonal tension, etc.)
5. Include text overlay instruction: exact headline (max 5 words) positioned where
6. End with style directive (photorealistic, flat design, bold graphic, etc.)

Example structure: "A [specific scene tied to the pain]. [Mood/emotion]. Color palette: [colors]. [Composition]. Bold text overlay '[exact headline]' in [position]. [Style]."

Output ONLY the image generation prompt — it will be sent directly to DALL-E.`;
}

export async function buildCreativeDirectorBrief(
  type: CreativeType,
  userInput: string,
  ctx: CreativeContext,
): Promise<string> {
  if (!userInput?.trim()) return userInput;

  let prompt: string;
  switch (type) {
    case 'avatar':
      prompt = avatarPrompt(ctx, userInput);
      break;
    case 'cinematic':
      prompt = cinematicPrompt(ctx, userInput);
      break;
    case 'animation':
      prompt = animationPrompt(ctx, userInput);
      break;
    case 'image':
      prompt = imagePrompt(ctx, userInput);
      break;
  }

  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      options: { temperature: 0.75, maxTokens: 900 },
    });
    const enhanced = res.output?.trim();
    // Sanity: if response is shorter than 20 chars something went wrong, use original
    if (!enhanced || enhanced.length < 20) return userInput;
    return enhanced;
  } catch (err) {
    // Never block generation — fall back to user's original input
    console.error('[creative-director] brief enhancement failed, using original:', err instanceof Error ? err.message : err);
    return userInput;
  }
}

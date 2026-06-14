// Review Board — 3 independent AI reviewers who evaluate a creative brief
// BEFORE it reaches any provider (HeyGen/DALL-E/Replicate).
//
// Why: a weak brief that fails review costs $0. A weak brief submitted to a
// provider costs $8–$15 AND wastes the client's time waiting for something
// that will be rejected anyway.
//
// The 3 reviewers are:
//   1. Performance Marketer — hook, CTA, click potential
//   2. Copywriter — natural flow, brand embedding, TTS-safe language
//   3. ICP Customer — "does this speak to me?" pain addressal
//
// Decision: 2/3 reject → Creative Director rewrites → max 2 rounds.
// If still failing after max rounds → pass anyway, flag for human review.
//
// Important: this reviews the BRIEF/SCRIPT, not the rendered video/image.
// Running on text (not pixels) keeps cost < $0.01 per review.

import { route } from '@vigmis/ai-router';
import type { CreativeContext } from './creative-context.js';

type CreativeType = 'avatar' | 'cinematic' | 'animation' | 'image';

export interface ReviewVerdict {
  pass: boolean;
  score: number;        // 0.0–1.0
  feedback: string;     // actionable — what specifically needs to change
  reviewer: string;
}

export interface ReviewBoardResult {
  passed: boolean;
  iterations: number;   // 0 = not run, 1–3 = rounds taken
  finalBrief: string;
  verdicts: ReviewVerdict[];
  forcedPass: boolean;  // true if it passed only because max iterations reached
}

const MAX_ITERATIONS = 2;

// ── Reviewer prompts ─────────────────────────────────────────────────────────

function performanceMarketerPrompt(type: CreativeType, brief: string, ctx: CreativeContext): string {
  return `You are a senior performance marketing manager. Evaluate this ${type} creative brief for its ability to drive real results.

BRIEF TO REVIEW:
${brief}

CLIENT CONTEXT:
- Target audience: ${ctx.targetAudience}
- Core pain: ${ctx.corePain}
- Core promise: ${ctx.corePromise}
- Goal: get a click/lead/purchase

EVALUATE on these 4 dimensions:
1. HOOK (0–25): Does it earn attention in under 2 seconds? Is it specific, not generic?
2. PAIN MATCH (0–25): Does it address the exact pain of the target audience?
3. CTA (0–25): Is the call to action clear and compelling? Is there urgency?
4. BRAND (0–25): Is the brand name mentioned naturally? Will the audience remember who made this?

Respond in this exact JSON format:
{
  "score": <0.0-1.0>,
  "pass": <true if score >= 0.65>,
  "feedback": "<1-3 specific sentences on what must change. Be concrete, not generic. If pass=true, write 'Approved.'>",
  "dimension_scores": { "hook": <0-25>, "pain_match": <0-25>, "cta": <0-25>, "brand": <0-25> }
}`;
}

function copywriterPrompt(type: CreativeType, brief: string, ctx: CreativeContext): string {
  return `You are a direct-response copywriter with 15 years of experience. Evaluate this ${type} creative brief for copy quality.

BRIEF TO REVIEW:
${brief}

CLIENT CONTEXT:
- Brand name: "${ctx.brandName}" — must appear mid-sentence, never as initials or standalone prefix
- Brand voice: ${ctx.brandVoice}
- Platform: ${ctx.platform || 'general'}

EVALUATE:
1. NATURAL LANGUAGE (0–25): Does it read/sound natural? No corporate speak, no banned words (innovative, seamless, cutting-edge, etc.)?
2. BRAND EMBEDDING (0–25): Is "${ctx.brandName}" mentioned naturally inside a complete sentence? Never as "V-I-G-M-I-S" spelled out?
3. FLOW & PACING (0–25): Does it build momentum? Short sentences where they count? No run-ons?
4. SPECIFICITY (0–25): Are claims specific ("saves 3 hours") rather than generic ("saves time")?

${type === 'avatar' ? 'EXTRA: Check for letter-spelling of the brand name (e.g. "V-I-G-M-I-S" spells out individual letters — flag immediately if present).' : ''}

Respond in this exact JSON format:
{
  "score": <0.0-1.0>,
  "pass": <true if score >= 0.65>,
  "feedback": "<1-3 specific sentences. If pass=true, write 'Approved.'>",
  "letter_spelling_detected": <true/false>
}`;
}

function icpCustomerPrompt(type: CreativeType, brief: string, ctx: CreativeContext): string {
  return `You are roleplaying as the ideal customer for this product. You are: ${ctx.targetAudience}

You have this specific pain: ${ctx.corePain}

Read this ${type} creative brief. Answer from YOUR perspective as this customer:

BRIEF:
${brief}

Would this ad make you click, stop scrolling, or take action?

EVALUATE:
1. RELEVANCE (0–25): Does this speak directly to YOUR situation and pain?
2. TRUST (0–25): Does this make you believe the promise? Is the proof convincing?
3. URGENCY (0–25): Does this make you want to act NOW, not later?
4. CLARITY (0–25): Is it immediately clear what this product does and who it's for?

Respond in this exact JSON format:
{
  "score": <0.0-1.0>,
  "pass": <true if score >= 0.65>,
  "feedback": "<Speak in first person as the ICP. What would make you more likely to click? If pass=true, write 'This would make me click.'>"
}`;
}

// ── Parse reviewer response ───────────────────────────────────────────────────

function parseVerdict(raw: string, reviewer: string): ReviewVerdict {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; pass?: boolean; feedback?: string };
      return {
        pass: parsed.pass === true,
        score: typeof parsed.score === 'number' ? parsed.score : (parsed.pass ? 0.7 : 0.4),
        feedback: typeof parsed.feedback === 'string' ? parsed.feedback : 'No feedback provided.',
        reviewer,
      };
    }
  } catch {
    // fall through
  }
  // Fallback: if response doesn't parse, treat as soft pass
  return { pass: true, score: 0.6, feedback: 'Review parsing failed — auto-passed.', reviewer };
}

// ── Single review round ───────────────────────────────────────────────────────

async function runOneRound(
  type: CreativeType,
  brief: string,
  ctx: CreativeContext,
): Promise<ReviewVerdict[]> {
  const [pmResult, cwResult, icpResult] = await Promise.allSettled([
    route({
      task: 'analysis',
      prompt: performanceMarketerPrompt(type, brief, ctx),
      options: { maxTokens: 400, temperature: 0.2 },
    }),
    route({
      task: 'analysis',
      prompt: copywriterPrompt(type, brief, ctx),
      options: { maxTokens: 400, temperature: 0.2 },
    }),
    route({
      task: 'analysis',
      prompt: icpCustomerPrompt(type, brief, ctx),
      options: { maxTokens: 400, temperature: 0.3 },
    }),
  ]);

  return [
    pmResult.status  === 'fulfilled' ? parseVerdict(pmResult.value.output, 'Performance Marketer')   : { pass: true, score: 0.5, feedback: 'Review unavailable.', reviewer: 'Performance Marketer' },
    cwResult.status  === 'fulfilled' ? parseVerdict(cwResult.value.output, 'Copywriter')             : { pass: true, score: 0.5, feedback: 'Review unavailable.', reviewer: 'Copywriter' },
    icpResult.status === 'fulfilled' ? parseVerdict(icpResult.value.output, 'ICP Customer')          : { pass: true, score: 0.5, feedback: 'Review unavailable.', reviewer: 'ICP Customer' },
  ];
}

// ── Rewrite prompt when board rejects ────────────────────────────────────────

async function rewriteBriefFromFeedback(
  type: CreativeType,
  currentBrief: string,
  verdicts: ReviewVerdict[],
  ctx: CreativeContext,
): Promise<string> {
  const failures = verdicts.filter(v => !v.pass);
  const feedbackBlock = failures.map(v => `${v.reviewer}: ${v.feedback}`).join('\n');

  try {
    const res = await route({
      task: 'analysis',
      prompt: `You are a world-class creative director. The review board rejected this ${type} brief.

CURRENT BRIEF:
${currentBrief}

REVIEW BOARD FEEDBACK:
${feedbackBlock}

TARGET AUDIENCE: ${ctx.targetAudience}
CORE PAIN: ${ctx.corePain}
CORE PROMISE: ${ctx.corePromise}
BRAND NAME: "${ctx.brandName}" — must appear naturally mid-sentence, never as initials
BRAND VOICE: ${ctx.brandVoice}
OFFER/CTA: ${ctx.offer}
PLATFORM: ${ctx.platform || 'general'}

Rewrite the brief to address EVERY point of feedback. Output ONLY the revised brief text — no preamble, no explanation, no quotes.`,
      options: { maxTokens: 600, temperature: 0.4 },
    });
    return res.output.trim();
  } catch {
    return currentBrief;
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runReviewBoard(
  type: CreativeType,
  brief: string,
  ctx: CreativeContext,
): Promise<ReviewBoardResult> {
  let currentBrief = brief;
  let lastVerdicts: ReviewVerdict[] = [];

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const verdicts = await runOneRound(type, currentBrief, ctx);
    lastVerdicts = verdicts;

    const rejectCount = verdicts.filter(v => !v.pass).length;
    const passed = rejectCount < 2; // majority pass = 2/3 or 3/3

    if (passed) {
      return {
        passed: true,
        iterations: i,
        finalBrief: currentBrief,
        verdicts,
        forcedPass: false,
      };
    }

    if (i < MAX_ITERATIONS) {
      // Rewrite and try again
      currentBrief = await rewriteBriefFromFeedback(type, currentBrief, verdicts, ctx);
    }
  }

  // Max iterations reached — force pass to avoid blocking generation
  return {
    passed: false,
    iterations: MAX_ITERATIONS,
    finalBrief: currentBrief,
    verdicts: lastVerdicts,
    forcedPass: true,
  };
}

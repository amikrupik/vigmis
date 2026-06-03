// Creative scorer — rates a creative 0-100 before publishing
// Uses LLM vision API to analyze: attention, clarity, emotion, CTA presence

import { db } from '@vigmis/db';

export interface CreativeScore {
  score: number;          // 0-100
  attention: number;      // 0-100: how much the eye is drawn in
  clarity: number;        // 0-100: is the message clear?
  emotion: number;        // 0-100: does it evoke the right feeling?
  cta_presence: number;   // 0-100: is there a clear call-to-action?
  verdict: 'excellent' | 'good' | 'fair' | 'poor';
  tips: string[];         // 1-3 specific improvement suggestions
}

export async function scoreCreativeImage(
  imageUrl: string,
  context: { platform: string; goal: string; brandVoice?: string },
): Promise<CreativeScore> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const prompt = `You are an expert advertising creative director. Score this ad creative image on a scale of 0-100 for these dimensions:
- Attention: How quickly does the eye land on the key message?
- Clarity: Is the product/service and offer immediately clear?
- Emotion: Does it evoke the right feeling for the goal (${context.goal})?
- CTA Presence: Is there a clear call-to-action visible?

Platform: ${context.platform}
Campaign goal: ${context.goal}
${context.brandVoice ? `Brand voice: ${context.brandVoice}` : ''}

Score each dimension 0-100 and provide 1-3 specific improvement tips.
Respond with valid JSON only:
{
  "attention": <number>,
  "clarity": <number>,
  "emotion": <number>,
  "cta_presence": <number>,
  "tips": ["tip1", "tip2"]
}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
        },
      ],
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI vision API failed: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const parsed = JSON.parse(data.choices[0].message.content) as Omit<CreativeScore, 'score' | 'verdict'>;

  const score = Math.round(
    (parsed.attention + parsed.clarity + parsed.emotion + parsed.cta_presence) / 4,
  );
  const verdict =
    score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';

  return { ...parsed, score, verdict };
}

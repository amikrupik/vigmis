// Creative Critic — AI-powered before/after creative comparison
// Uses GPT-4o Vision to compare original and revised image
// Returns { score: 0-1, issues: string[], pass: boolean }
// score >= 0.75 = pass, < 0.75 = regenerate (up to 2 retries)

export interface CriticResult {
  score: number;     // 0-1
  issues: string[];
  pass: boolean;
}

export async function critiqueCreative(
  previousUrl: string,
  newUrl: string,
): Promise<CriticResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const prompt = `You are an expert advertising creative director comparing a revised creative against the original.

Evaluate the revision on these criteria:
1. Did it improve or maintain visual quality?
2. Is the core brand identity preserved?
3. Is the message clearer or at least as clear as the original?
4. Are key brand elements (logo, product, person/face) intact if they should be?

Score the revised creative from 0.0 to 1.0 (0=terrible regression, 1=excellent improvement).
0.75+ means it passes quality check.

List specific issues if score < 0.75 (be concise, max 3 issues).

Respond with valid JSON only:
{
  "score": <number 0.0-1.0>,
  "issues": ["issue1", "issue2"]
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
            { type: 'text', text: 'Original creative:' },
            { type: 'image_url', image_url: { url: previousUrl, detail: 'low' } },
            { type: 'text', text: 'Revised creative:' },
            { type: 'image_url', image_url: { url: newUrl, detail: 'low' } },
          ],
        },
      ],
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI critic API failed: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const parsed = JSON.parse(data.choices[0].message.content) as { score: number; issues: string[] };

  return {
    score: parsed.score,
    issues: parsed.issues ?? [],
    pass: parsed.score >= 0.75,
  };
}

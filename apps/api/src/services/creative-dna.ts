// Creative DNA — analyze an existing ad image via GPT-4o Vision
// to extract style, character, tone, and replication instructions.
// Stored in client_settings.creative_dna and injected into every
// Creative Director brief so new creatives match the reference.

export interface CreativeDNA {
  reference_asset_id: string;
  reference_url: string;
  visual_style: string;
  character_description: string;
  emotional_tone: string;
  keep_instructions: string;
  analyzed_at: string;
}

export async function analyzeCreativeImage(imageUrl: string, assetId: string): Promise<CreativeDNA> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          {
            type: 'text',
            text: `You are analyzing an advertising creative to extract its visual DNA so new ads can be generated in the exact same style.

Return a JSON object with exactly these fields:
- visual_style: 3-6 words describing the visual style (e.g. "warm close-up product photography", "bold flat design illustration")
- character_description: if a person is visible, describe them specifically (e.g. "athletic woman 30s, workout gear, genuine smile"). Write "no person" if none.
- emotional_tone: 2-4 words (e.g. "energetic authentic relatable", "calm premium aspirational")
- keep_instructions: 2-3 specific sentences to replicate this style. Include colors, mood, composition, character direction if applicable. Be prescriptive — "use warm amber tones, close-up framing, genuine expression, avoid staged poses".

Return ONLY valid JSON. No markdown, no extra text.`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) throw new Error(`GPT-4o analysis failed: ${res.status} ${res.statusText}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim() ?? '{}';

  let parsed: any = {};
  try { parsed = JSON.parse(content); } catch {
    parsed = { keep_instructions: content.slice(0, 300) };
  }

  return {
    reference_asset_id: assetId,
    reference_url: imageUrl,
    visual_style: parsed.visual_style ?? '',
    character_description: parsed.character_description ?? '',
    emotional_tone: parsed.emotional_tone ?? '',
    keep_instructions: parsed.keep_instructions ?? '',
    analyzed_at: new Date().toISOString(),
  };
}

// Creative Brief — strategic framing for every creative.
//
// pain → promise → proof → objection. The 4 questions a real copywriter answers
// BEFORE writing the headline. Without a brief, "generate 5 variations" = 5
// different ways to fail. With a brief, every variation hits the same arc
// from a different angle (emotional/rational, short/long, hook/feature).

import { route } from '@vigmis/ai-router';
import { db } from '@vigmis/db';

export interface CreativeBrief {
  id?: string;
  tenant_id?: string;
  product_name: string;
  product_slug?: string | null;
  is_default?: boolean;
  audience_pain: string;
  promise: string;
  proof: string;
  objection_to_kill: string;
  emotional_hook?: string | null;
  rational_hook?: string | null;
  forbidden_angles?: string[];
  source?: 'ai_extracted' | 'customer_provided' | 'customer_edited' | 'imported';
}

const EXTRACTION_PROMPT = `You are a senior direct-response copywriter. Given a business description, extract the strategic creative brief that any ad campaign for this business should follow.

Output STRICT JSON, no markdown fences:
{
  "product_name": "<the specific product or service the brief is about>",
  "audience_pain": "<the specific problem this product solves — one sentence, concrete, not generic>",
  "promise": "<the specific transformation/outcome the customer gets — one sentence, observable>",
  "proof": "<why the customer should believe the promise — mechanism, social proof, credentials, data, or guarantee>",
  "objection_to_kill": "<the #1 reason a qualified prospect would still say no — and how the ad answers it>",
  "emotional_hook": "<the feeling we want the prospect to feel in the first 3 seconds of the ad>",
  "rational_hook": "<the logical argument that closes the sale>",
  "forbidden_angles": ["<angle1>", "<angle2>"]
}

Rules:
- pain and promise must be SPECIFIC to this business. "Save time" is not a pain. "Spending 4 hours/week reconciling Excel exports from 3 different platforms" is a pain.
- proof must be something the business can credibly back up. Don't invent testimonials. If you don't see proof in the input, write "Mechanism-based — explain how it works" and let the human fill it in.
- objection_to_kill must reflect a REAL skeptical question, not a generic objection.
- forbidden_angles: avoid clichés relevant to this industry. E.g. for supplements: "no before-after photos, no doctor-in-a-lab-coat stock images". For SaaS: "no '10x productivity' claims, no fake countdown timers". 2-4 items.`;

export interface ExtractionInput {
  websiteAnalysis?: string | null;
  businessGoal?: string;
  heroProductName?: string;
  productMarginPct?: number | null;
}

export async function extractCreativeBrief(input: ExtractionInput): Promise<CreativeBrief | null> {
  if (!input.websiteAnalysis || input.websiteAnalysis.trim().length < 200) return null;

  const prompt = [
    input.heroProductName ? `Focus on this product: ${input.heroProductName}` : '',
    input.businessGoal ? `Business goal: ${input.businessGoal}` : '',
    input.productMarginPct ? `Gross margin: ${input.productMarginPct}%` : '',
    '',
    `WEBSITE / BUSINESS DESCRIPTION:`,
    input.websiteAnalysis.trim().slice(0, 5000),
  ].filter(Boolean).join('\n');

  let raw: string;
  try {
    const res = await route({
      task: 'analysis',
      systemPrompt: EXTRACTION_PROMPT,
      prompt,
      options: { temperature: 0.5, maxTokens: 700 },
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
    if (!parsed.audience_pain || !parsed.promise || !parsed.proof || !parsed.objection_to_kill) {
      return null;
    }
    return {
      product_name: parsed.product_name ?? (input.heroProductName ?? 'Main offer'),
      audience_pain: parsed.audience_pain,
      promise: parsed.promise,
      proof: parsed.proof,
      objection_to_kill: parsed.objection_to_kill,
      emotional_hook: parsed.emotional_hook ?? null,
      rational_hook: parsed.rational_hook ?? null,
      forbidden_angles: Array.isArray(parsed.forbidden_angles) ? parsed.forbidden_angles : [],
      source: 'ai_extracted',
    };
  } catch {
    return null;
  }
}

export async function saveCreativeBrief(tenantId: string, brief: CreativeBrief, opts?: { isDefault?: boolean }): Promise<string | null> {
  const slug = brief.product_slug ?? slugify(brief.product_name);
  if (opts?.isDefault) {
    // Clear other defaults first
    await db.from('creative_briefs')
      .update({ is_default: false })
      .eq('tenant_id', tenantId);
  }
  const { data, error } = await db.from('creative_briefs').upsert(
    {
      tenant_id: tenantId,
      product_name: brief.product_name,
      product_slug: slug,
      is_default: opts?.isDefault ?? brief.is_default ?? false,
      audience_pain: brief.audience_pain,
      promise: brief.promise,
      proof: brief.proof,
      objection_to_kill: brief.objection_to_kill,
      emotional_hook: brief.emotional_hook ?? null,
      rational_hook: brief.rational_hook ?? null,
      forbidden_angles: brief.forbidden_angles ?? [],
      source: brief.source ?? 'ai_extracted',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,product_slug' },
  ).select('id').single();

  if (error || !data) return null;
  return data.id;
}

export async function getDefaultBrief(tenantId: string): Promise<CreativeBrief | null> {
  const { data } = await db.from('creative_briefs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle();
  if (!data) {
    // Fall back to any brief for this tenant
    const { data: any } = await db.from('creative_briefs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return any as CreativeBrief | null;
  }
  return data as CreativeBrief;
}

/**
 * Build a brief instruction block for a generation prompt. Used by social-content
 * and ad-copy generators to ensure variations align to one arc.
 */
export function briefInstructions(brief: CreativeBrief | null): string {
  if (!brief) return '';
  const lines = [
    `CREATIVE BRIEF — every variation must address this exact arc:`,
    `- Pain: ${brief.audience_pain}`,
    `- Promise: ${brief.promise}`,
    `- Proof: ${brief.proof}`,
    `- Objection to kill: ${brief.objection_to_kill}`,
  ];
  if (brief.emotional_hook) lines.push(`- Emotional hook (first 3s): ${brief.emotional_hook}`);
  if (brief.rational_hook) lines.push(`- Rational hook: ${brief.rational_hook}`);
  if (brief.forbidden_angles && brief.forbidden_angles.length > 0) {
    lines.push(`- AVOID these angles: ${brief.forbidden_angles.join(' | ')}`);
  }
  return lines.join('\n');
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9֐-׿؀-ۿЀ-ӿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Video & Image Creative Generation API
//
// POST /creatives/generate    — submit a generation job (video or image)
// GET  /creatives/:id/status  — poll job status
// GET  /creatives             — list all creative jobs for tenant (with chain info)
// POST /creatives/:id/approve — approve a completed creative
// POST /creatives/:id/reject  — discard without charge
// POST /creatives/score       — vision-based pre-launch scoring
// PATCH /settings/brand       — update brand DNA (colors, locked elements, approved styles)
//
// Supported providers:
//   avatar    → HeyGen       (HEYGEN_API_KEY)       $15/video
//   cinematic → Replicate    (REPLICATE_API_TOKEN)  $12/video
//   animation → Replicate    (REPLICATE_API_TOKEN)  $8/video
//   image     → gpt-image-1  (OPENAI_API_KEY)       $5/image
//
// Revision pricing (A1):
//   revision 0-2: free (set approved_at immediately)
//   revision 3-5: 50% of original price
//   revision 6+: blocked at generate time
//
// Scale credits (A2):
//   Plan 'pro': 1 video credit + 3 image credits per month, reset on new period
//
// Brand DNA (B2): injected from client_settings into every prompt
//
// Keep/Change (C2): parent revision includes keep_elements + change_request
//
// AI Critic (C5): image-only, compare before/after, retry up to 2x if score < 0.75
//
// Best-of-3 (C6): image-only, generate 3 DALL-E images, return highest-scoring

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { scoreCreativeImage } from '../services/creative-scorer.js';
import { critiqueCreative } from '../services/creative-critic.js';
import { getOrCreateStripeCustomer, createCreativeApprovalCheckout } from '../billing/stripe.js';

// ── Revision pricing (50% of original for revisions 3-5) ────────────────────
// Full prices in cents
const FULL_PRICES_CENTS: Record<string, number> = {
  avatar: 1500,
  cinematic: 1200,
  animation: 800,
  image: 500,
};

// 50% revision prices in cents (revisions 3-5)
const REVISION_PRICES_CENTS: Record<string, number> = {
  avatar: 750,
  cinematic: 600,
  animation: 400,
  image: 250,
};

// ── Supabase Storage upload ───────────────────────────────────────────────────

async function uploadVideoToStorage(
  providerUrl: string,
  jobId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    const res = await fetch(providerUrl);
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const path = `${tenantId}/${jobId}.mp4`;

    const { error } = await db.storage
      .from('creatives')
      .upload(path, buffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (error) {
      console.error('Storage upload error:', error.message);
      return null;
    }

    const { data } = db.storage.from('creatives').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('uploadVideoToStorage failed:', err);
    return null;
  }
}

async function uploadImageToStorage(
  imageUrl: string,
  jobId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    let buffer: ArrayBuffer;

    if (imageUrl.startsWith('data:')) {
      // gpt-image-1 returns base64 data URLs — decode directly without HTTP fetch
      const commaIdx = imageUrl.indexOf(',');
      if (commaIdx === -1) return null;
      const b64 = imageUrl.slice(commaIdx + 1);
      const binary = Buffer.from(b64, 'base64');
      buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      buffer = await res.arrayBuffer();
    }

    const path = `${tenantId}/${jobId}.png`;

    const { error } = await db.storage
      .from('creatives')
      .upload(path, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) return null;

    const { data } = db.storage.from('creatives').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('uploadImageToStorage failed:', err);
    return null;
  }
}

type CreativeType = 'avatar' | 'cinematic' | 'animation' | 'image';
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'pending_setup';

// ── Provider availability ────────────────────────────────────────────────────

function isProviderReady(type: CreativeType): boolean {
  switch (type) {
    case 'avatar': {
      const key = process.env.HEYGEN_API_KEY ?? '';
      // Reject non-ASCII keys — fetch() throws ByteString error on X-Api-Key headers
      return key.length > 0 && /^[\x20-\x7E]+$/.test(key);
    }
    case 'cinematic':
    case 'animation': {
      const token = process.env.REPLICATE_API_TOKEN ?? '';
      // Reject non-ASCII tokens — fetch() throws ByteString error on Authorization headers
      return token.length > 0 && /^[\x20-\x7E]+$/.test(token);
    }
    case 'image':     return !!process.env.OPENAI_API_KEY;
  }
}

// ── HeyGen — Talking Avatar ──────────────────────────────────────────────────

async function submitHeyGenJob(brief: {
  script: string;
  avatar_id?: string;
  voice_id?: string;
  background?: string;
}): Promise<{ jobId: string }> {
  const apiKey = process.env.HEYGEN_API_KEY!;

  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: brief.avatar_id ?? 'Anna_public_3_20240108',
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: brief.script,
            voice_id: brief.voice_id ?? 'en-US-AriaNeural',
          },
          background: brief.background
            ? { type: 'image', url: brief.background }
            : { type: 'color', value: '#ffffff' },
        },
      ],
      dimension: { width: 1280, height: 720 },
      aspect_ratio: '16:9',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HeyGen API error: ${body}`);
  }

  const json = await res.json() as { data?: { video_id: string }; error?: string };
  if (!json.data?.video_id) {
    throw new Error(`HeyGen: ${json.error ?? 'No video_id returned'}`);
  }

  return { jobId: json.data.video_id };
}

async function checkHeyGenStatus(jobId: string): Promise<{ status: JobStatus; url?: string; reason?: string }> {
  const apiKey = process.env.HEYGEN_API_KEY!;
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${jobId}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (!res.ok) return { status: 'processing' };

  const json = await res.json() as {
    data?: { status: string; video_url?: string }
  };

  const s = json.data?.status;
  if (s === 'completed') return { status: 'completed', url: json.data?.video_url };
  if (s === 'failed') return { status: 'failed', reason: 'HeyGen reported video generation failed' };
  return { status: 'processing' };
}

// ── Replicate — Cinematic + Animation ────────────────────────────────────────

const REPLICATE_API = 'https://api.replicate.com/v1';

const REPLICATE_MODELS = {
  cinematic: 'minimax/video-01',
  animation: 'lucataco/animate-diff-v2',
};

async function submitReplicateJob(
  model: string,
  input: Record<string, unknown>,
): Promise<{ jobId: string }> {
  const token = process.env.REPLICATE_API_TOKEN!;

  const res = await fetch(`${REPLICATE_API}/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait=5',
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate API error (${res.status}): ${body}`);
  }

  const json = await res.json() as { id?: string; error?: string };
  if (!json.id) throw new Error(`Replicate: ${json.error ?? 'No prediction ID returned'}`);

  return { jobId: json.id };
}

async function checkReplicateStatus(jobId: string): Promise<{ status: JobStatus; url?: string; reason?: string }> {
  const token = process.env.REPLICATE_API_TOKEN!;

  const res = await fetch(`${REPLICATE_API}/predictions/${jobId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) return { status: 'processing' };

  const json = await res.json() as {
    status?: string;
    output?: string | string[];
    error?: string;
  };

  if (json.status === 'succeeded') {
    const url = Array.isArray(json.output) ? json.output[0] : json.output;
    return { status: 'completed', url: url ?? undefined };
  }
  if (json.status === 'failed' || json.status === 'canceled') {
    return { status: 'failed', reason: json.error ?? `Replicate job ${json.status}` };
  }
  return { status: 'processing' };
}

async function submitCinematicJob(brief: { prompt: string }): Promise<{ jobId: string }> {
  return submitReplicateJob(REPLICATE_MODELS.cinematic, {
    prompt: brief.prompt,
    prompt_optimizer: true,
  });
}

async function submitAnimationJob(brief: {
  prompt: string;
  negative_prompt?: string;
  num_frames?: number;
}): Promise<{ jobId: string }> {
  return submitReplicateJob(REPLICATE_MODELS.animation, {
    prompt: brief.prompt,
    negative_prompt: brief.negative_prompt ?? 'low quality, blurry, jitter, watermark',
    num_frames: brief.num_frames ?? 16,
    num_inference_steps: 25,
    guidance_scale: 7.5,
  });
}

// ── gpt-image-1 — Image Creative ─────────────────────────────────────────────
// Synchronous — returns base64 image immediately (no polling)
// dall-e-3 was retired; gpt-image-1 is the current generation model.
// API changes vs dall-e-3:
//   - `response_format` param removed (b64_json always returned)
//   - `quality` values changed: 'low' | 'medium' | 'high' | 'auto'  (not 'standard'/'hd')
//   - model id is 'gpt-image-1'

async function submitDallEJob(brief: {
  prompt: string;
  style?: string;
}): Promise<{ jobId: string; url: string }> {
  const apiKey = process.env.OPENAI_API_KEY!;

  const styleHint = brief.style ? `, style: ${brief.style}` : '';
  const fullPrompt = `${brief.prompt}${styleHint}. High quality advertising creative image. Suitable for digital ads.`;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Sanitize — never forward raw OpenAI response (contains org_id and other sensitive fields)
    let safeMessage = 'Image generation failed';
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } };
      safeMessage = parsed?.error?.message ?? safeMessage;
    } catch { /* not JSON */ }
    throw new Error(safeMessage);
  }

  const data = await res.json() as { data: Array<{ b64_json?: string; url?: string }> };
  const img = data.data[0];
  if (!img) throw new Error('Image generation returned no image');

  // gpt-image-1 always returns b64_json — convert to a data URL so the rest of
  // the pipeline (scorer, storage upload) can treat it like a regular URL.
  const b64 = img.b64_json;
  if (!b64) throw new Error('Image generation returned no b64_json');
  const dataUrl = `data:image/png;base64,${b64}`;

  return { jobId: `gptimage-${Date.now()}`, url: dataUrl };
}

// ── Best-of-3 for images ───────────────────────────────────────────────────────
// Generates 3 images in parallel, scores each, returns highest-scoring one

async function generateBestOfThreeImages(
  prompt: string,
  style: string | undefined,
): Promise<{ url: string; score: number; allUrls: string[] }> {
  // Stagger starts by 3s to avoid simultaneous burst hitting rate limits (P1-1)
  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const results = await Promise.allSettled([
    submitDallEJob({ prompt, style }),
    delay(3_000).then(() => submitDallEJob({ prompt, style })),
    delay(6_000).then(() => submitDallEJob({ prompt, style })),
  ]);

  const urls: string[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      urls.push(r.value.url);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push(msg);
      console.error('Image generation attempt failed:', msg);
    }
  }

  if (urls.length === 0) {
    throw new Error(`All image generation attempts failed: ${errors.join(' | ')}`);
  }
  if (urls.length === 1) return { url: urls[0], score: 0, allUrls: urls };

  // Score each image
  const scores = await Promise.allSettled(
    urls.map(u => scoreCreativeImage(u, { platform: 'meta', goal: 'awareness' })),
  );

  let bestUrl = urls[0];
  let bestScore = 0;

  for (let i = 0; i < urls.length; i++) {
    const s = scores[i];
    if (s.status === 'fulfilled' && s.value.score > bestScore) {
      bestScore = s.value.score;
      bestUrl = urls[i];
    }
  }

  return { url: bestUrl, score: bestScore, allUrls: urls };
}

// ── Brand DNA builder ─────────────────────────────────────────────────────────

function buildBrandDNA(settings: {
  brand_colors?: string[] | null;
  do_not_change_elements?: string[] | null;
  approved_creative_styles?: any[] | null;
}): string {
  const parts: string[] = [];

  if (settings.brand_colors && settings.brand_colors.length > 0) {
    parts.push(`Brand colors: ${settings.brand_colors.join(', ')}`);
  }

  if (settings.do_not_change_elements && settings.do_not_change_elements.length > 0) {
    parts.push(`DO NOT MODIFY these elements: ${settings.do_not_change_elements.join(', ')}`);
  }

  if (settings.approved_creative_styles && settings.approved_creative_styles.length > 0) {
    const styleDesc = settings.approved_creative_styles
      .map((s: any) => (typeof s === 'string' ? s : s.description ?? JSON.stringify(s)))
      .join(', ');
    parts.push(`Previously approved style: ${styleDesc}`);
  }

  return parts.join('\n');
}

// ── Keep/Change instruction builder ──────────────────────────────────────────

function buildKeepChangeInstruction(
  keepElements: string[],
  changeRequest: string,
): string {
  const parts: string[] = [];
  if (keepElements.length > 0) {
    parts.push(`KEEP EXACTLY: ${keepElements.join(', ')}.`);
  }
  if (changeRequest) {
    parts.push(`CHANGE ONLY: ${changeRequest}.`);
  }
  if (keepElements.length > 0) {
    parts.push('DO NOT modify anything else.');
  }
  return parts.join(' ');
}

// ── Scale credits logic ───────────────────────────────────────────────────────

function currentCreditsPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Returns true if credit was consumed (free), false if should charge
async function restoreScaleCredit(tenantId: string, creditType: 'video' | 'image'): Promise<void> {
  const { data: billing } = await db
    .from('billing_customers')
    .select('plan, scale_video_credits_used, scale_image_credits_used')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!billing || (billing as any).plan !== 'pro') return;
  if (creditType === 'video') {
    const used = Math.max(0, ((billing as any).scale_video_credits_used ?? 1) - 1);
    await db.from('billing_customers').update({ scale_video_credits_used: used, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
  } else {
    const used = Math.max(0, ((billing as any).scale_image_credits_used ?? 1) - 1);
    await db.from('billing_customers').update({ scale_image_credits_used: used, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
  }
}

async function consumeScaleCredit(
  tenantId: string,
  creditType: 'video' | 'image',
): Promise<boolean> {
  const { data: billing } = await db
    .from('billing_customers')
    .select('plan, scale_video_credits_used, scale_image_credits_used, scale_post_credits_used, credits_period, downgrade_requested_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!billing || (billing as any).plan !== 'pro') return false;

  // Downgrade requested — no new credits
  if ((billing as any).downgrade_requested_at) return false;

  const currentPeriod = currentCreditsPeriod();
  const storedPeriod = (billing as any).credits_period ?? '';

  // Determine current usage (reset if new period)
  let videoUsed = (billing as any).scale_video_credits_used ?? 0;
  let imageUsed = (billing as any).scale_image_credits_used ?? 0;

  if (storedPeriod !== currentPeriod) {
    // New month — reset credits
    videoUsed = 0;
    imageUsed = 0;
    await db
      .from('billing_customers')
      .update({
        scale_video_credits_used: 0,
        scale_image_credits_used: 0,
        scale_post_credits_used: 0,
        credits_period: currentPeriod,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);
  }

  const VIDEO_LIMIT = 1;
  const IMAGE_LIMIT = 3;

  if (creditType === 'video') {
    if (videoUsed >= VIDEO_LIMIT) return false; // no credits left, charge normally
    await db
      .from('billing_customers')
      .update({
        scale_video_credits_used: videoUsed + 1,
        credits_period: currentPeriod,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);
    return true;
  } else {
    if (imageUsed >= IMAGE_LIMIT) return false;
    await db
      .from('billing_customers')
      .update({
        scale_image_credits_used: imageUsed + 1,
        credits_period: currentPeriod,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);
    return true;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function creativeRoutes(app: FastifyInstance) {

  // POST /creatives/generate
  app.post('/creatives/generate', { preHandler: authenticate }, async (request, reply) => {
    const {
      type,
      brief,
      campaign_id,
      platform,
      parent_job_id,
      keep_elements,
      change_request,
    } = request.body as {
      type: CreativeType;
      brief: Record<string, any>;
      campaign_id?: string;
      platform?: string;
      parent_job_id?: string;
      keep_elements?: string[];
      change_request?: string;
    };

    if (!type || !brief) {
      return reply.code(400).send({ error: 'type and brief are required' });
    }

    const validTypes: CreativeType[] = ['avatar', 'cinematic', 'animation', 'image'];
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    // Fetch brand DNA from client_settings
    const { data: clientSettings } = await db
      .from('client_settings')
      .select('logo_url, website_url, brand_colors, do_not_change_elements, approved_creative_styles')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const logoUrl: string | null = (clientSettings as any)?.logo_url ?? null;
    const websiteUrl: string | null = (clientSettings as any)?.website_url ?? null;

    // Build Brand DNA string
    const brandDNA = buildBrandDNA({
      brand_colors: (clientSettings as any)?.brand_colors ?? null,
      do_not_change_elements: (clientSettings as any)?.do_not_change_elements ?? null,
      approved_creative_styles: (clientSettings as any)?.approved_creative_styles ?? null,
    });

    // Build Keep/Change instruction for revisions
    const keepChangeInstruction = (keep_elements?.length || change_request)
      ? buildKeepChangeInstruction(keep_elements ?? [], change_request ?? '')
      : '';

    // Enrich the brief — normalize string briefs to avoid char-indexed spread (P1-2)
    // Avatar uses `script`, not `prompt` — map accordingly so HeyGen gets input_text
    const rawBrief: Record<string, any> = typeof brief === 'string'
      ? (type === 'avatar' ? { script: brief } : { prompt: brief })
      : (brief ?? {});
    const enrichedBrief = { ...rawBrief };

    if (type === 'avatar' && typeof enrichedBrief.script === 'string') {
      if (logoUrl && !enrichedBrief.background) {
        enrichedBrief._logo_url = logoUrl;
      }
      if (websiteUrl && !enrichedBrief.script.includes(websiteUrl)) {
        enrichedBrief.script = `${enrichedBrief.script} Visit us at ${websiteUrl}.`;
      }
      if (brandDNA) {
        enrichedBrief._brand_dna = brandDNA;
      }
      if (keepChangeInstruction) {
        enrichedBrief.script = `${keepChangeInstruction} ${enrichedBrief.script}`;
      }
    }

    if ((type === 'cinematic' || type === 'animation') && typeof enrichedBrief.prompt === 'string') {
      const additions: string[] = [];
      if (brandDNA) additions.push(brandDNA);
      if (keepChangeInstruction) additions.push(keepChangeInstruction);
      if (logoUrl) additions.push(`Incorporate the brand identity and logo style from ${logoUrl}.`);
      if (websiteUrl) additions.push(`End with a call-to-action: visit ${websiteUrl}.`);
      if (additions.length > 0) {
        enrichedBrief.prompt = `${enrichedBrief.prompt} ${additions.join(' ')}`;
      }
    }

    if (type === 'image' && typeof enrichedBrief.prompt === 'string') {
      const additions: string[] = [];
      if (brandDNA) additions.push(brandDNA);
      if (keepChangeInstruction) additions.push(keepChangeInstruction);
      if (additions.length > 0) {
        enrichedBrief.prompt = `${enrichedBrief.prompt} ${additions.join(' ')}`;
      }
    }

    // Revision tracking
    let revisionNumber = 0;
    let parentOutputUrl: string | null = null;

    if (parent_job_id) {
      const { data: parentJob } = await db
        .from('creative_jobs')
        .select('id, tenant_id, output_url')
        .eq('id', parent_job_id)
        .eq('tenant_id', request.tenantId)
        .maybeSingle();

      if (!parentJob) {
        return reply.code(404).send({ error: 'Parent job not found' });
      }

      parentOutputUrl = (parentJob as any).output_url ?? null;

      // Only count non-failed siblings — failed revisions must not consume the revision budget (P0-3)
      const { count: siblingCount } = await db
        .from('creative_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('parent_job_id', parent_job_id)
        .eq('tenant_id', request.tenantId)
        .neq('status', 'failed');

      revisionNumber = (siblingCount ?? 0) + 1;

      if (revisionNumber > 5) {
        return reply.code(400).send({ error: 'Maximum 5 revisions reached for this creative. Please start a new creative.' });
      }
    }

    // Check Scale credits for revision 0 (first generation)
    // Scale gets 1 video / 3 image credits per month
    let creditConsumed = false;
    if (revisionNumber === 0) {
      const creditType = (type === 'image') ? 'image' : 'video';
      if (['avatar', 'cinematic', 'animation', 'image'].includes(type)) {
        creditConsumed = await consumeScaleCredit(request.tenantId, creditType as 'video' | 'image');
      }
    }

    const providerReady = isProviderReady(type);

    // Insert job record
    const { data: job, error: insertErr } = await db
      .from('creative_jobs')
      .insert({
        tenant_id: request.tenantId,
        campaign_id: campaign_id ?? null,
        type,
        platform: platform ?? null,
        brief: enrichedBrief,
        status: providerReady ? 'queued' : 'pending_setup',
        provider_job_id: null,
        output_url: null,
        parent_job_id: parent_job_id ?? null,
        revision_number: revisionNumber,
        keep_elements: keep_elements ?? [],
        change_request: change_request ?? null,
        credit_consumed: creditConsumed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      return reply.code(500).send({ error: 'Failed to create job' });
    }

    if (!providerReady) {
      const providerName = type === 'avatar' ? 'HeyGen' : type === 'image' ? 'DALL-E' : 'Replicate';
      const envVar = type === 'avatar' ? 'HEYGEN_API_KEY' : type === 'image' ? 'OPENAI_API_KEY' : 'REPLICATE_API_TOKEN';
      return reply.code(202).send({
        job_id: job.id,
        status: 'pending_setup',
        message: `${providerName} (${envVar}) not configured. Brief saved.`,
        type,
        revision_number: revisionNumber,
        credit_consumed: creditConsumed,
      });
    }

    // ── DALL-E image: synchronous generation with best-of-3 ──────────────────
    if (type === 'image') {
      try {
        const imagePrompt = typeof enrichedBrief.prompt === 'string'
          ? enrichedBrief.prompt
          : JSON.stringify(enrichedBrief);

        let finalUrl: string;
        let criticScore: number | null = null;
        let allUrls: string[] = [];

        // Best-of-3
        const bestOf3 = await generateBestOfThreeImages(imagePrompt, enrichedBrief.style);
        finalUrl = bestOf3.url;
        allUrls = bestOf3.allUrls;

        // AI Critic for revisions (compare against parent)
        if (parent_job_id && parentOutputUrl) {
          let retryCount = 0;
          let criticResult = await critiqueCreative(parentOutputUrl, finalUrl).catch(() => null);
          criticScore = criticResult?.score ?? null;

          while (criticResult && !criticResult.pass && retryCount < 2) {
            retryCount++;
            // Back off before regenerating to avoid immediate rate-limit burst (P1-1)
            await new Promise(r => setTimeout(r, 15_000 + retryCount * 5_000));
            const retry = await generateBestOfThreeImages(imagePrompt, enrichedBrief.style);
            finalUrl = retry.url;
            allUrls = [...allUrls, ...retry.allUrls];
            criticResult = await critiqueCreative(parentOutputUrl, finalUrl).catch(() => null);
            criticScore = criticResult?.score ?? criticScore;
          }
        }

        // Store to Supabase Storage
        const storedUrl = await uploadImageToStorage(finalUrl, job.id, request.tenantId);
        const outputUrl = storedUrl ?? finalUrl;

        // Strip internal pipeline metadata before persisting — _all_candidate_urls must not
        // leak into the brief column or it corrupts revision prompts (P1-2)
        const { _all_candidate_urls: _drop, ...storedBrief } = enrichedBrief;

        await db
          .from('creative_jobs')
          .update({
            status: 'completed',
            output_url: outputUrl,
            provider_job_id: `dalle-${Date.now()}`,
            critic_score: criticScore,
            brief: storedBrief,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return reply.code(201).send({
          job_id: job.id,
          status: 'completed',
          type,
          output_url: outputUrl,
          revision_number: revisionNumber,
          credit_consumed: creditConsumed,
          critic_score: criticScore,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image generation failed';
        await db
          .from('creative_jobs')
          .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
          .eq('id', job.id);
        if (creditConsumed) await restoreScaleCredit(request.tenantId, 'image').catch(() => {});
        return reply.code(500).send({ error: message, job_id: job.id });
      }
    }

    // ── Video: async generation with provider polling ─────────────────────────
    try {
      let providerJobId: string;

      if (type === 'avatar') {
        const result = await submitHeyGenJob(enrichedBrief as any);
        providerJobId = result.jobId;
      } else if (type === 'cinematic') {
        const result = await submitCinematicJob(enrichedBrief as any);
        providerJobId = result.jobId;
      } else {
        const result = await submitAnimationJob(enrichedBrief as any);
        providerJobId = result.jobId;
      }

      await db
        .from('creative_jobs')
        .update({ provider_job_id: providerJobId, status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', job.id);

      const estimatedCostUsd = type === 'avatar' ? 15 : type === 'cinematic' ? 12 : 8;

      return reply.code(202).send({
        job_id: job.id,
        provider_job_id: providerJobId,
        status: 'processing',
        type,
        revision_number: revisionNumber,
        credit_consumed: creditConsumed,
        estimated_cost_usd: creditConsumed ? 0 : estimatedCostUsd,
        estimated_minutes: type === 'avatar' ? 3 : type === 'cinematic' ? 5 : 4,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      console.error(`[creatives] ${type} job submission failed (job=${job.id}):`, message);
      await db
        .from('creative_jobs')
        .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      if (creditConsumed) await restoreScaleCredit(request.tenantId, 'video').catch(() => {});

      return reply.code(500).send({ error: message, job_id: job.id });
    }
  });

  // GET /creatives/:id/status — poll for completion
  app.get('/creatives/:id/status', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: job, error } = await db
      .from('creative_jobs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (error || !job) return reply.code(404).send({ error: 'Job not found' });

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'pending_setup') {
      return reply.send({
        job_id: job.id,
        status: job.status,
        type: job.type,
        output_url: job.output_url ?? null,
        critic_score: (job as any).critic_score ?? null,
        error_message: (job as any).error_message ?? null,
      });
    }

    if (!job.provider_job_id) {
      return reply.send({ job_id: job.id, status: job.status, type: job.type });
    }

    try {
      let result: { status: JobStatus; url?: string };

      if (job.type === 'avatar') {
        result = await checkHeyGenStatus(job.provider_job_id);
      } else {
        result = await checkReplicateStatus(job.provider_job_id);
      }

      if (result.status === 'completed' && result.url) {
        const storedUrl = await uploadVideoToStorage(result.url, job.id, job.tenant_id);
        const finalUrl = storedUrl ?? result.url;

        await db
          .from('creative_jobs')
          .update({
            status: 'completed',
            output_url: finalUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return reply.send({
          job_id: job.id,
          status: 'completed',
          type: job.type,
          output_url: finalUrl,
        });
      }

      if (result.status === 'failed') {
        const pollReason = (result as any).reason ?? 'Provider reported failure';
        await db
          .from('creative_jobs')
          .update({ status: 'failed', error_message: pollReason, updated_at: new Date().toISOString() })
          .eq('id', job.id);
      }

      return reply.send({ job_id: job.id, status: result.status, type: job.type });
    } catch {
      return reply.send({ job_id: job.id, status: job.status, type: job.type });
    }
  });

  // GET /creatives/avatars — list available HeyGen avatars
  app.get('/creatives/avatars', { preHandler: authenticate }, async (_request, reply) => {
    if (!process.env.HEYGEN_API_KEY) {
      return reply.send({ avatars: [], available: false });
    }

    try {
      const res = await fetch('https://api.heygen.com/v2/avatars', {
        headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY },
      });

      if (!res.ok) return reply.send({ avatars: [], available: true });

      const json = await res.json() as { data?: { avatars?: any[] } };
      const avatars = (json.data?.avatars ?? []).slice(0, 20).map((a: any) => ({
        id: a.avatar_id,
        name: a.avatar_name,
        preview_url: a.preview_image_url ?? null,
        gender: a.gender ?? null,
      }));

      return reply.send({ avatars, available: true });
    } catch {
      return reply.send({ avatars: [], available: false });
    }
  });

  // GET /creatives/voices — list available HeyGen voices
  app.get('/creatives/voices', { preHandler: authenticate }, async (_request, reply) => {
    if (!process.env.HEYGEN_API_KEY) {
      return reply.send({ voices: [], available: false });
    }

    try {
      const res = await fetch('https://api.heygen.com/v2/voices', {
        headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY },
      });

      if (!res.ok) return reply.send({ voices: [], available: true });

      const json = await res.json() as { data?: { voices?: any[] } };
      const voices = (json.data?.voices ?? [])
        .filter((v: any) => v.language === 'English')
        .slice(0, 20)
        .map((v: any) => ({
          id: v.voice_id,
          name: v.display_name,
          gender: v.gender ?? null,
          preview_url: v.preview_audio ?? null,
        }));

      return reply.send({ voices, available: true });
    } catch {
      return reply.send({ voices: [], available: false });
    }
  });

  // GET /creatives — list all jobs for tenant (with chain/history info)
  app.get('/creatives', { preHandler: authenticate }, async (request, reply) => {
    const { data: jobs } = await db
      .from('creative_jobs')
      .select('id, type, platform, status, output_url, brief, campaign_id, created_at, revision_number, parent_job_id, approved_at, keep_elements, change_request, critic_score, credit_consumed')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    return reply.send({ jobs: jobs ?? [] });
  });

  // POST /creatives/score — vision-based pre-launch scoring
  app.post('/creatives/score', { preHandler: authenticate }, async (request, reply) => {
    const { image_url, platform, goal } = request.body as {
      image_url: string;
      platform: string;
      goal?: string;
    };

    if (!image_url || !platform) {
      return reply.code(400).send({ error: 'image_url and platform are required' });
    }

    try {
      const score = await scoreCreativeImage(image_url, {
        platform,
        goal: goal ?? 'awareness',
      });
      return reply.send(score);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scoring failed';
      return reply.code(500).send({ error: message });
    }
  });

  // POST /creatives/:id/approve — approve a completed creative
  // revision 0-2: free (set approved_at immediately)
  // revision 3-5: charge 50% of original price
  app.post('/creatives/:id/approve', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: job, error: fetchErr } = await db
      .from('creative_jobs')
      .select('id, type, status, revision_number, approved_at, tenant_id')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (fetchErr || !job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status !== 'completed') return reply.code(400).send({ error: 'Job is not completed yet' });
    if (job.approved_at) return reply.send({ success: true, charged: false, already_approved: true });

    const revisionNumber = job.revision_number ?? 0;

    // Revisions 0-2: free
    if (revisionNumber <= 2) {
      await db
        .from('creative_jobs')
        .update({ approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', request.tenantId);

      return reply.send({ success: true, charged: false });
    }

    // Revisions 3-5: charge 50% of original price
    const amountCents = REVISION_PRICES_CENTS[job.type] ?? 750;

    const { data: tenant } = await db
      .from('tenants')
      .select('email')
      .eq('id', request.tenantId)
      .single();

    const email = tenant?.email ?? `tenant+${request.tenantId}@vigmis.com`;
    const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

    const customerId = await getOrCreateStripeCustomer(request.tenantId, email);
    const checkoutUrl = await createCreativeApprovalCheckout(
      customerId,
      request.tenantId,
      job.id,
      amountCents,
      `Creative revision approval — ${job.type} revision ${revisionNumber} (50% rate)`,
      `${WEB_URL}/studio?approved=${job.id}`,
      `${WEB_URL}/studio?canceled=${job.id}`,
    );

    return reply.code(402).send({ success: false, charged: true, checkout_url: checkoutUrl });
  });

  // POST /creatives/:id/reject — discard without charge
  app.post('/creatives/:id/reject', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data: job, error: fetchErr } = await db
      .from('creative_jobs')
      .select('id, status, tenant_id')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (fetchErr || !job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status === 'rejected') return reply.send({ success: true, already_rejected: true });

    const { error } = await db
      .from('creative_jobs')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', request.tenantId);

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ success: true });
  });

  // PATCH /settings/brand — update Brand DNA
  app.patch('/settings/brand', { preHandler: authenticate }, async (request, reply) => {
    const { brand_colors, brand_fonts, do_not_change_elements, approved_creative_styles } = request.body as {
      brand_colors?: string[];
      brand_fonts?: string[];
      do_not_change_elements?: string[];
      approved_creative_styles?: any[];
    };

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (brand_colors !== undefined) updates.brand_colors = brand_colors;
    if (brand_fonts !== undefined) updates.brand_fonts = brand_fonts;
    if (do_not_change_elements !== undefined) updates.do_not_change_elements = do_not_change_elements;
    if (approved_creative_styles !== undefined) updates.approved_creative_styles = approved_creative_styles;

    const { error } = await db
      .from('client_settings')
      .update(updates)
      .eq('tenant_id', request.tenantId);

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ success: true });
  });
}

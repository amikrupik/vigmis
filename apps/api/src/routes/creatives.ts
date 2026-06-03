// Video Creative Generation API
//
// POST /creatives/generate    — submit a video generation job
// GET  /creatives/:id/status  — poll job status
// GET  /creatives             — list all creative jobs for tenant
//
// Supported providers (activate by adding API keys to Railway):
//   avatar    → HeyGen       (HEYGEN_API_KEY)       $15/video
//   cinematic → Replicate    (REPLICATE_API_TOKEN)  $12/video  (minimax/video-01)
//   animation → Replicate    (REPLICATE_API_TOKEN)  $8/video   (lucataco/animate-diff-v2)
//
// Until keys are present: jobs are queued with status "pending_setup"
// and the user sees a friendly "coming soon" message.
//
// Creative assets are stored in Supabase Storage bucket "creatives".
// TODO: create the "creatives" bucket in Supabase → Storage → New Bucket → Public.

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { scoreCreativeImage } from '../services/creative-scorer.js';

// ── Supabase Storage upload ───────────────────────────────────────────────────
// Copies a provider video URL to Supabase Storage bucket "creatives"
// and returns the permanent CDN URL.
// TODO: create bucket "creatives" in Supabase → Storage → New Bucket → Public.

async function uploadVideoToStorage(
  providerUrl: string,
  jobId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    const res = await fetch(providerUrl);
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const ext = providerUrl.includes('.mp4') ? 'mp4' : 'mp4';
    const path = `${tenantId}/${jobId}.${ext}`;

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

type CreativeType = 'avatar' | 'cinematic' | 'animation';
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'pending_setup';

// ── Provider availability ────────────────────────────────────────────────────

function isProviderReady(type: CreativeType): boolean {
  switch (type) {
    case 'avatar':    return !!process.env.HEYGEN_API_KEY;
    case 'cinematic': return !!process.env.REPLICATE_API_TOKEN;
    case 'animation': return !!process.env.REPLICATE_API_TOKEN;
  }
}

// ── HeyGen — Talking Avatar ──────────────────────────────────────────────────
// Docs: https://docs.heygen.com/reference/create-an-avatar-video-v2
// POST https://api.heygen.com/v2/video/generate

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

async function checkHeyGenStatus(jobId: string): Promise<{ status: JobStatus; url?: string }> {
  const apiKey = process.env.HEYGEN_API_KEY!;
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${jobId}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (!res.ok) return { status: 'processing' };

  const json = await res.json() as {
    data?: { status: string; video_url?: string; thumbnail_url?: string }
  };

  const s = json.data?.status;
  if (s === 'completed') return { status: 'completed', url: json.data?.video_url };
  if (s === 'failed') return { status: 'failed' };
  return { status: 'processing' };
}

// ── Replicate — Cinematic + Animation ────────────────────────────────────────
// Docs: https://replicate.com/docs/reference/http
// Cinematic: minimax/video-01 — photorealistic, cinematic quality, ~$0.05/video
// Animation: lucataco/animate-diff-v2 — smooth motion graphics, ~$0.03/video

const REPLICATE_API = 'https://api.replicate.com/v1';

// Replicate model identifiers (owner/name — latest version resolved automatically)
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
      'Prefer': 'wait=5',   // wait up to 5s for fast models before falling back to polling
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate API error (${res.status}): ${body}`);
  }

  const json = await res.json() as { id?: string; error?: string; status?: string };
  if (!json.id) throw new Error(`Replicate: ${json.error ?? 'No prediction ID returned'}`);

  return { jobId: json.id };
}

async function checkReplicateStatus(jobId: string): Promise<{ status: JobStatus; url?: string }> {
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
    return { status: 'failed' };
  }
  return { status: 'processing' };
}

async function submitCinematicJob(brief: {
  prompt: string;
  negative_prompt?: string;
  duration?: number;
}): Promise<{ jobId: string }> {
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

// ── Routes ───────────────────────────────────────────────────────────────────

export async function creativeRoutes(app: FastifyInstance) {

  // POST /creatives/generate
  app.post('/creatives/generate', { preHandler: authenticate }, async (request, reply) => {
    const {
      type,           // 'avatar' | 'cinematic' | 'animation'
      brief,          // object with generation params (prompt/script/etc)
      campaign_id,    // optional — attach creative to a campaign
      platform,       // 'google' | 'meta' | 'tiktok'
    } = request.body as {
      type: CreativeType;
      brief: Record<string, any>;
      campaign_id?: string;
      platform?: string;
    };

    if (!type || !brief) {
      return reply.code(400).send({ error: 'type and brief are required' });
    }

    // Enrich the brief with brand context from client_settings
    const { data: clientSettings } = await db
      .from('client_settings')
      .select('logo_url, website_url')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const logoUrl: string | null = (clientSettings as any)?.logo_url ?? null;
    const websiteUrl: string | null = (clientSettings as any)?.website_url ?? null;

    // Enrich avatar brief: inject logo + CTA into script
    const enrichedBrief = { ...brief };
    if (type === 'avatar' && typeof enrichedBrief.script === 'string') {
      if (logoUrl) {
        enrichedBrief.script = `${enrichedBrief.script}`;
        // Logo reference for avatar: pass as background hint
        if (!enrichedBrief.background) {
          enrichedBrief._logo_url = logoUrl;
        }
      }
      // Append CTA to script if not already ending with website/contact
      if (websiteUrl && !enrichedBrief.script.includes(websiteUrl)) {
        enrichedBrief.script = `${enrichedBrief.script} Visit us at ${websiteUrl}.`;
      }
    }

    // Enrich cinematic/animation brief: inject logo and CTA into prompt
    if ((type === 'cinematic' || type === 'animation') && typeof enrichedBrief.prompt === 'string') {
      const additions: string[] = [];
      if (logoUrl) {
        additions.push(`Incorporate the brand identity and logo style from ${logoUrl}.`);
      }
      if (websiteUrl) {
        additions.push(`End with a call-to-action: visit ${websiteUrl} or contact the business.`);
      }
      if (additions.length > 0) {
        enrichedBrief.prompt = `${enrichedBrief.prompt} ${additions.join(' ')}`;
      }
    }

    const providerReady = isProviderReady(type);

    // Insert job record (store the enriched brief so future polling can reconstruct context)
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      return reply.code(500).send({ error: 'Failed to create job' });
    }

    if (!providerReady) {
      const providerName = type === 'avatar' ? 'HeyGen' : 'Replicate';
      const envVar = type === 'avatar' ? 'HEYGEN_API_KEY' : 'REPLICATE_API_TOKEN';
      return reply.code(202).send({
        job_id: job.id,
        status: 'pending_setup',
        message: `${providerName} API key (${envVar}) not yet configured in Railway. Your brief has been saved and will be processed once the integration is active.`,
        type,
        estimated_cost_usd: type === 'avatar' ? 15 : type === 'cinematic' ? 12 : 8,
      });
    }

    // Submit to provider using enriched brief
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

      return reply.code(202).send({
        job_id: job.id,
        provider_job_id: providerJobId,
        status: 'processing',
        type,
        estimated_cost_usd: type === 'avatar' ? 15 : type === 'cinematic' ? 12 : 8,
        estimated_minutes: type === 'avatar' ? 3 : type === 'cinematic' ? 5 : 4,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      await db
        .from('creative_jobs')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', job.id);

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

    // Already done
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'pending_setup') {
      return reply.send({
        job_id: job.id,
        status: job.status,
        type: job.type,
        output_url: job.output_url ?? null,
      });
    }

    // Poll the provider
    if (!job.provider_job_id) {
      return reply.send({ job_id: job.id, status: job.status, type: job.type });
    }

    try {
      let result: { status: JobStatus; url?: string };

      if (job.type === 'avatar') {
        result = await checkHeyGenStatus(job.provider_job_id);
      } else {
        // cinematic + animation both use Replicate
        result = await checkReplicateStatus(job.provider_job_id);
      }

      if (result.status === 'completed' && result.url) {
        // Upload to Supabase Storage for permanent CDN delivery
        const storedUrl = await uploadVideoToStorage(result.url, job.id, job.tenant_id);
        const finalUrl = storedUrl ?? result.url; // fall back to provider URL if Storage fails

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
        await db
          .from('creative_jobs')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', job.id);
      }

      return reply.send({ job_id: job.id, status: result.status, type: job.type });
    } catch {
      return reply.send({ job_id: job.id, status: job.status, type: job.type });
    }
  });

  // GET /creatives/avatars — list available HeyGen avatars for tenant to pick from
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

  // GET /creatives — list all jobs for tenant
  app.get('/creatives', { preHandler: authenticate }, async (request, reply) => {
    const { data: jobs } = await db
      .from('creative_jobs')
      .select('id, type, platform, status, output_url, brief, campaign_id, created_at')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

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
}

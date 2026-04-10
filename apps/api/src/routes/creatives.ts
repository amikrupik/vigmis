// Video Creative Generation API
//
// POST /creatives/generate    — submit a video generation job
// GET  /creatives/:id/status  — poll job status
// GET  /creatives             — list all creative jobs for tenant
//
// Supported providers (activate by adding API keys to Railway):
//   avatar    → HeyGen     (HEYGEN_API_KEY)   $15/video
//   cinematic → Kling AI   (KLING_API_KEY)    $12/video
//   animation → Pika Labs  (PIKA_API_KEY)     $8/video
//
// Until keys are present: jobs are queued with status "pending_setup"
// and the user sees a friendly "coming soon" message.
//
// Creative assets are stored in Supabase Storage bucket "creatives".
// TODO: create the "creatives" bucket in Supabase dashboard.

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

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
    case 'cinematic': return !!process.env.KLING_API_KEY;
    case 'animation': return !!process.env.PIKA_API_KEY;
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

// ── Kling AI — Cinematic ─────────────────────────────────────────────────────
// Docs: https://klingai.com/api-reference (partner API, apply at klingai.com/api)
// POST https://api.klingai.com/v1/videos/text2video

async function submitKlingJob(brief: {
  prompt: string;
  negative_prompt?: string;
  duration?: number;  // seconds: 5 or 10
  aspect_ratio?: string;
}): Promise<{ jobId: string }> {
  const apiKey = process.env.KLING_API_KEY!;

  const res = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kling-v1',
      prompt: brief.prompt,
      negative_prompt: brief.negative_prompt ?? 'low quality, blurry, watermark',
      cfg_scale: 0.5,
      mode: 'std',
      duration: brief.duration ?? 5,
      aspect_ratio: brief.aspect_ratio ?? '16:9',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kling API error: ${body}`);
  }

  const json = await res.json() as { data?: { task_id: string }; message?: string };
  if (!json.data?.task_id) {
    throw new Error(`Kling: ${json.message ?? 'No task_id returned'}`);
  }

  return { jobId: json.data.task_id };
}

async function checkKlingStatus(jobId: string): Promise<{ status: JobStatus; url?: string }> {
  const apiKey = process.env.KLING_API_KEY!;
  const res = await fetch(`https://api.klingai.com/v1/videos/text2video/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) return { status: 'processing' };

  const json = await res.json() as {
    data?: {
      task_status: string;
      task_result?: { videos?: Array<{ url: string }> };
    }
  };

  const s = json.data?.task_status;
  if (s === 'succeed') {
    return { status: 'completed', url: json.data?.task_result?.videos?.[0]?.url };
  }
  if (s === 'failed') return { status: 'failed' };
  return { status: 'processing' };
}

// ── Pika Labs — Animation ────────────────────────────────────────────────────
// Docs: https://pika.art/api (partner API, apply at pika.art/api)
// POST https://api.pika.art/v1/generate

async function submitPikaJob(brief: {
  prompt: string;
  style?: string;
  duration?: number;
}): Promise<{ jobId: string }> {
  const apiKey = process.env.PIKA_API_KEY!;

  const res = await fetch('https://api.pika.art/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      promptText: brief.prompt,
      style: brief.style ?? 'cinematic',
      duration: brief.duration ?? 3,
      aspectRatio: '16:9',
      frameRate: 24,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pika API error: ${body}`);
  }

  const json = await res.json() as { id?: string; error?: string };
  if (!json.id) throw new Error(`Pika: ${json.error ?? 'No job ID returned'}`);

  return { jobId: json.id };
}

async function checkPikaStatus(jobId: string): Promise<{ status: JobStatus; url?: string }> {
  const apiKey = process.env.PIKA_API_KEY!;
  const res = await fetch(`https://api.pika.art/v1/generate/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) return { status: 'processing' };

  const json = await res.json() as { status?: string; result_url?: string };

  if (json.status === 'completed') return { status: 'completed', url: json.result_url };
  if (json.status === 'failed') return { status: 'failed' };
  return { status: 'processing' };
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

    const providerReady = isProviderReady(type);

    // Insert job record
    const { data: job, error: insertErr } = await db
      .from('creative_jobs')
      .insert({
        tenant_id: request.tenantId,
        campaign_id: campaign_id ?? null,
        type,
        platform: platform ?? null,
        brief,
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
      // API key not yet configured — queue for when it's set up
      return reply.code(202).send({
        job_id: job.id,
        status: 'pending_setup',
        message: `${type === 'avatar' ? 'HeyGen' : type === 'cinematic' ? 'Kling AI' : 'Pika'} API key not yet configured. Your brief has been saved and will be processed once the integration is active.`,
        type,
        estimated_cost_usd: type === 'avatar' ? 15 : type === 'cinematic' ? 12 : 8,
      });
    }

    // Submit to provider
    try {
      let providerJobId: string;

      if (type === 'avatar') {
        const result = await submitHeyGenJob(brief as any);
        providerJobId = result.jobId;
      } else if (type === 'cinematic') {
        const result = await submitKlingJob(brief as any);
        providerJobId = result.jobId;
      } else {
        const result = await submitPikaJob(brief as any);
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
      } else if (job.type === 'cinematic') {
        result = await checkKlingStatus(job.provider_job_id);
      } else {
        result = await checkPikaStatus(job.provider_job_id);
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
}

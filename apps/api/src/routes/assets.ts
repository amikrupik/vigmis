// Brand Asset Library
// POST /assets/upload    — upload image/video to Supabase brand_assets bucket
// GET  /assets           — list tenant's brand assets
// DELETE /assets/:id     — delete a brand asset

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

const BUCKET = 'brand_assets';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function assetRoutes(app: FastifyInstance) {
  // ── Upload brand asset ─────────────────────────────────────────────────────
  app.post('/assets/upload', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file?.();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_SIZE) {
      return reply.code(400).send({ error: 'File too large — maximum 10 MB' });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!allowed.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Unsupported file type. Allowed: JPG, PNG, GIF, WebP, MP4, MOV' });
    }

    const ext = data.mimetype.split('/')[1].replace('quicktime', 'mov');
    const filename = data.filename?.replace(/[^a-z0-9._-]/gi, '_') ?? `file.${ext}`;
    const path = `${request.tenantId}/${Date.now()}_${filename}`;
    const kind = data.mimetype.startsWith('video/') ? 'video' : 'image';

    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, {
      contentType: data.mimetype,
      upsert: false,
    });
    if (uploadError) return reply.code(500).send({ error: uploadError.message });

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);

    const { data: row, error: dbError } = await db.from('brand_assets').insert({
      tenant_id: request.tenantId,
      storage_path: path,
      public_url: urlData.publicUrl,
      filename: data.filename ?? filename,
      mime_type: data.mimetype,
      size_bytes: buffer.length,
      kind,
    }).select().single();

    if (dbError) return reply.code(500).send({ error: dbError.message });
    return reply.code(201).send(row);
  });

  // ── Direct upload: get signed URL ────────────────────────────────────────
  // Browser uploads file directly to Supabase Storage (no Railway round-trip).
  app.post('/assets/signed-url', { preHandler: authenticate }, async (request, reply) => {
    const { filename, mime_type, size_bytes } = request.body as { filename: string; mime_type: string; size_bytes: number };

    if (!filename || !mime_type) return reply.code(400).send({ error: 'filename and mime_type required' });
    if (size_bytes && size_bytes > MAX_SIZE) return reply.code(400).send({ error: 'File too large — maximum 10 MB' });

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!allowed.includes(mime_type)) return reply.code(400).send({ error: 'Unsupported file type' });

    const ext = mime_type.split('/')[1].replace('quicktime', 'mov');
    const safeName = filename.replace(/[^a-z0-9._-]/gi, '_');
    const path = `${request.tenantId}/${Date.now()}_${safeName}`;

    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return reply.code(500).send({ error: error?.message ?? 'Failed to create signed URL' });

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);

    return reply.send({
      signed_url: data.signedUrl,
      token: data.token,
      path,
      public_url: urlData.publicUrl,
    });
  });

  // ── Direct upload: register after browser upload completes ──────────────
  app.post('/assets/register', { preHandler: authenticate }, async (request, reply) => {
    const { path, public_url, filename, mime_type, size_bytes } = request.body as any;

    if (!path || !public_url || !mime_type) return reply.code(400).send({ error: 'path, public_url, mime_type required' });

    const kind = mime_type.startsWith('video/') ? 'video' : 'image';

    const { data: row, error: dbError } = await db.from('brand_assets').insert({
      tenant_id: request.tenantId,
      storage_path: path,
      public_url,
      filename: filename ?? path.split('/').pop(),
      mime_type,
      size_bytes: size_bytes ?? 0,
      kind,
    }).select().single();

    if (dbError) return reply.code(500).send({ error: dbError.message });
    return reply.code(201).send(row);
  });

  // ── List brand assets ──────────────────────────────────────────────────────
  app.get('/assets', { preHandler: authenticate }, async (request, reply) => {
    const { kind } = request.query as { kind?: string };
    let q = db.from('brand_assets')
      .select('id, filename, public_url, mime_type, kind, size_bytes, created_at')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false });

    if (kind) q = q.eq('kind', kind);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ assets: data ?? [] });
  });

  // ── Delete brand asset ─────────────────────────────────────────────────────
  app.delete('/assets/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: row } = await db.from('brand_assets')
      .select('storage_path')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    if (!row) return reply.code(404).send({ error: 'Asset not found' });

    // Storage removal failure is non-fatal (orphaned file is acceptable — it won't be served)
    await db.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});

    const { error: delErr } = await db.from('brand_assets').delete().eq('id', id).eq('tenant_id', request.tenantId);
    if (delErr) return reply.code(500).send({ error: delErr.message });

    return reply.send({ success: true });
  });

  // ── Get creative reference ─────────────────────────────────────────────────
  app.get('/assets/reference', { preHandler: authenticate }, async (request, reply) => {
    const { data, error } = await db.from('client_settings')
      .select('creative_dna')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ creative_dna: (data as any)?.creative_dna ?? null });
  });

  // ── Set creative reference ─────────────────────────────────────────────────
  // Analyzes an image asset with GPT-4o Vision and stores style DNA in
  // client_settings.creative_dna for injection into future creative briefs.
  app.post('/assets/:id/set-reference', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: asset } = await db.from('brand_assets')
      .select('public_url, mime_type, filename')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    const isImage = (asset.mime_type ?? '').startsWith('image/');

    let creativeDna: Record<string, any> = {
      reference_asset_id: id,
      reference_url: asset.public_url,
      analyzed_at: new Date().toISOString(),
    };

    if (isImage && asset.public_url) {
      try {
        const { analyzeCreativeImage } = await import('../services/creative-dna.js');
        const analysis = await analyzeCreativeImage(asset.public_url, id);
        creativeDna = { ...creativeDna, ...analysis };
      } catch (err) {
        console.error('[assets] DNA analysis failed:', err instanceof Error ? err.message : err);
      }
    }

    const { error: upsertErr } = await db.from('client_settings').upsert(
      { tenant_id: request.tenantId, creative_dna: creativeDna, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );
    if (upsertErr) return reply.code(500).send({ error: 'Failed to persist Creative DNA' });

    return reply.send({ success: true, creative_dna: creativeDna });
  });

  // ── Clear creative reference ───────────────────────────────────────────────
  app.delete('/assets/reference', { preHandler: authenticate }, async (request, reply) => {
    await db.from('client_settings')
      .update({ creative_dna: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', request.tenantId);
    return reply.send({ success: true });
  });
}

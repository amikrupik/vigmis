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

    await db.storage.from(BUCKET).remove([row.storage_path]);
    await db.from('brand_assets').delete().eq('id', id).eq('tenant_id', request.tenantId);

    return reply.send({ success: true });
  });
}

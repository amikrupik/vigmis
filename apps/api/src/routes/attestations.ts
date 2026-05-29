// Attestation routes — explicit customer sign-off on content responsibility
//
// POST /attestations          → record a new attestation (checkbox)
// GET  /attestations           → list this tenant's attestations
// GET  /attestations/required  → which attestations are missing/expired right now
//
// The customer MUST have a valid onboarding_master attestation before any
// publish action goes through. For high-stakes publishes (claims, prices,
// promises) a publish_high_stakes attestation is required per-publish.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';

// Canonical attestation statements — versioned. NEVER edit a published version;
// bump to v2 instead. The customer's signed copy must remain reproducible.
//
// Final legal wording requires lawyer review. These are placeholders that
// already capture the legal intent so they hold up even before lawyer review.
export const ATTESTATION_STATEMENTS = {
  onboarding_master: {
    v1: `I confirm that all information, claims, prices, media, and business representations I provide to Vigmis are accurate, lawful, and either owned by me or used with proper authorization. I understand that Vigmis is an advertising-automation tool and is not the source of business truth — I am solely responsible for the accuracy of what I submit. I agree to Vigmis's Terms of Service and Acceptable Use Policy.`,
  },
  publish_high_stakes: {
    v1: `I have reviewed this content and confirm that all claims, prices, promises, guarantees, and media used are accurate, lawful, and authorized for use. I take full responsibility for publishing this content.`,
  },
  periodic_re_attestation: {
    v1: `I confirm that the business information, pricing, inventory, licenses, and product representations stored in Vigmis remain accurate as of today. I will update any that have changed.`,
  },
  industry_eligibility: {
    v1: `I confirm that I hold the professional license(s) required to advertise services in my industry (medical, financial, legal, gambling, alcohol, cannabis, or other regulated category, as applicable), and the license is valid in every jurisdiction where my ads will run.`,
  },
  ip_ownership: {
    v1: `I confirm that I own — or have explicit written permission to use — every image, video, logo, brand mark, music track, and piece of copy submitted to Vigmis. I will indemnify Vigmis against any third-party IP claim arising from content I submitted.`,
  },
  tos_acceptance: {
    v1: `I have read and agree to Vigmis's Terms of Service and Acceptable Use Policy. I understand Vigmis reserves the right to refuse or terminate service at its sole discretion, including for content I view as legitimate but Vigmis views as risky.`,
  },
  ai_disclosure_consent: {
    v1: `I authorize Vigmis to label AI-generated content with platform-required disclosures (Meta, Google, TikTok AI-content labels, EU AI Act notices). I understand that omitting these labels is a violation of the platform's terms.`,
  },
} as const;

type AttestationKind = keyof typeof ATTESTATION_STATEMENTS;

const RecordBody = z.object({
  attestation_kind: z.enum([
    'onboarding_master',
    'publish_high_stakes',
    'periodic_re_attestation',
    'industry_eligibility',
    'ip_ownership',
    'tos_acceptance',
    'ai_disclosure_consent',
  ]),
  attestation_version: z.string().default('v1'),
  signer_email: z.string().email().optional(),
  context: z.record(z.unknown()).optional(),     // e.g. {license_no:'X',jurisdiction:'IL'}
  valid_until: z.string().datetime().optional(), // ISO string; used for periodic re-attestation
});

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function getStatement(kind: AttestationKind, version: string): string | null {
  const versions = ATTESTATION_STATEMENTS[kind] as Record<string, string>;
  return versions[version] ?? null;
}

export async function attestationRoutes(app: FastifyInstance) {
  // ── POST /attestations ──────────────────────────────────────────────────
  app.post('/attestations', { preHandler: authenticate }, async (request, reply) => {
    const parse = RecordBody.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
    }
    const body = parse.data;

    const statement = getStatement(body.attestation_kind, body.attestation_version);
    if (!statement) {
      return reply.code(400).send({
        error: 'unknown_statement_version',
        detail: `No statement for ${body.attestation_kind} ${body.attestation_version}`,
      });
    }

    const clientIp = request.ip ?? null;
    const userAgent = (request.headers['user-agent'] as string | undefined) ?? null;

    const { data, error } = await db
      .from('content_attestations')
      .insert({
        tenant_id: request.tenantId,
        attestation_kind: body.attestation_kind,
        attestation_version: body.attestation_version,
        statement_shown: statement,
        statement_hash: sha256Hex(statement),
        signer_clerk_user_id: request.clerkUserId,
        signer_email: body.signer_email ?? null,
        client_ip: clientIp,
        user_agent: userAgent,
        context: body.context ?? null,
        valid_until: body.valid_until ?? null,
      })
      .select('id, signed_at')
      .single();

    if (error || !data) {
      request.log.error({ error }, 'Failed to persist attestation');
      return reply.code(500).send({ error: 'persist_failed' });
    }

    return reply.send({
      id: data.id,
      signed_at: data.signed_at,
      attestation_kind: body.attestation_kind,
      attestation_version: body.attestation_version,
    });
  });

  // ── GET /attestations ───────────────────────────────────────────────────
  app.get('/attestations', { preHandler: authenticate }, async (request, reply) => {
    const { data, error } = await db
      .from('content_attestations')
      .select('id, attestation_kind, attestation_version, signed_at, valid_until, signer_email, context')
      .eq('tenant_id', request.tenantId)
      .order('signed_at', { ascending: false })
      .limit(200);

    if (error) {
      return reply.code(500).send({ error: 'fetch_failed' });
    }
    return reply.send({ attestations: data ?? [] });
  });

  // ── GET /attestations/required ──────────────────────────────────────────
  // Returns the list of attestations the tenant currently NEEDS to sign
  // (missing or expired). The UI uses this to gate publish actions.
  app.get('/attestations/required', { preHandler: authenticate }, async (request, reply) => {
    const { data, error } = await db
      .from('content_attestations')
      .select('attestation_kind, attestation_version, signed_at, valid_until')
      .eq('tenant_id', request.tenantId)
      .order('signed_at', { ascending: false });

    if (error) {
      return reply.code(500).send({ error: 'fetch_failed' });
    }

    const now = Date.now();
    const latest = new Map<string, { signed_at: string; valid_until: string | null }>();
    for (const row of (data ?? []) as Array<{
      attestation_kind: string;
      attestation_version: string;
      signed_at: string;
      valid_until: string | null;
    }>) {
      if (!latest.has(row.attestation_kind)) {
        latest.set(row.attestation_kind, {
          signed_at: row.signed_at,
          valid_until: row.valid_until,
        });
      }
    }

    const requiredKinds: AttestationKind[] = [
      'onboarding_master',
      'tos_acceptance',
      'ai_disclosure_consent',
    ];

    const missing: { kind: AttestationKind; reason: 'never_signed' | 'expired' }[] = [];
    for (const kind of requiredKinds) {
      const found = latest.get(kind);
      if (!found) {
        missing.push({ kind, reason: 'never_signed' });
        continue;
      }
      if (found.valid_until && new Date(found.valid_until).getTime() < now) {
        missing.push({ kind, reason: 'expired' });
      }
    }

    return reply.send({ missing, latest: Object.fromEntries(latest) });
  });
}

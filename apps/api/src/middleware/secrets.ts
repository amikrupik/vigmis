// Shared secret-comparison + cron/admin auth helpers.
//
// Two rules enforced here:
//   1. Fail closed — if the expected secret env var is unset, the request is
//      rejected. We never fall back to a public/hardcoded default.
//   2. Constant-time compare — avoids leaking the secret via timing.

import { timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

/** Constant-time string compare that is also length-safe (no throw on mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True when the request carries a valid x-cron-secret. Fails closed if CRON_SECRET is unset. */
export function hasValidCronSecret(req: FastifyRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // no public default — unset means locked
  const provided = (req.headers['x-cron-secret'] as string) ?? '';
  return safeEqual(provided, expected);
}

/** Guard for cron routes. Sends 401 and returns false when the secret is missing/wrong. */
export function assertCronSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!hasValidCronSecret(req)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** Header value used by the API's own internal cron self-calls. Empty string if unset (→ rejected). */
export function cronSecretHeader(): string {
  return process.env.CRON_SECRET ?? '';
}

/** Strip secrets from a URL before it reaches logs (token=, code=, access_token=, state=, hmac=, …). */
const SENSITIVE_QS = /\b(token|code|access_token|refresh_token|secret|state|hmac|signature|api_key|key|password|client_secret)=([^&#]*)/gi;
export function sanitizeUrl(url: string): string {
  if (!url) return url;
  const q = url.indexOf('?');
  if (q === -1) return url;
  const path = url.slice(0, q);
  const query = url.slice(q + 1).replace(SENSITIVE_QS, '$1=[redacted]');
  return `${path}?${query}`;
}

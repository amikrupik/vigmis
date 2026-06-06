import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyRequest } from 'fastify';
import { safeEqual, sanitizeUrl, hasValidCronSecret } from './secrets.js';

test('safeEqual is correct and length-safe', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('a', 'ab'), false); // different length → false, no throw
  assert.equal(safeEqual('', ''), true);
});

test('sanitizeUrl redacts sensitive query params, keeps the rest', () => {
  assert.equal(
    sanitizeUrl('/auth/google/callback?code=abc123&state=xyz&scope=ads'),
    '/auth/google/callback?code=[redacted]&state=[redacted]&scope=ads',
  );
  assert.equal(
    sanitizeUrl('/auth?token=secret&page=2'),
    '/auth?token=[redacted]&page=2',
  );
  assert.match(sanitizeUrl('/x?access_token=A&hmac=B&signature=C'), /access_token=\[redacted\].*hmac=\[redacted\].*signature=\[redacted\]/);
});

test('sanitizeUrl leaves URLs without a query string untouched', () => {
  assert.equal(sanitizeUrl('/dashboard'), '/dashboard');
  assert.equal(sanitizeUrl(''), '');
});

// Guards the security work: cron auth must fail closed when CRON_SECRET is unset.
test('hasValidCronSecret fails closed when CRON_SECRET is unset', () => {
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const req = { headers: { 'x-cron-secret': 'anything' } } as unknown as FastifyRequest;
  assert.equal(hasValidCronSecret(req), false);
  if (saved !== undefined) process.env.CRON_SECRET = saved;
});

test('hasValidCronSecret matches only the exact secret', () => {
  const saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'the-real-secret';
  const ok = { headers: { 'x-cron-secret': 'the-real-secret' } } as unknown as FastifyRequest;
  const bad = { headers: { 'x-cron-secret': 'vigmis-cron' } } as unknown as FastifyRequest;
  const none = { headers: {} } as unknown as FastifyRequest;
  assert.equal(hasValidCronSecret(ok), true);
  assert.equal(hasValidCronSecret(bad), false);
  assert.equal(hasValidCronSecret(none), false);
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

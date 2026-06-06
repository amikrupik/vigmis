import { test } from 'node:test';
import assert from 'node:assert/strict';

// 64-hex test key (32 bytes). Set BEFORE importing — crypto reads env at call time.
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? 'a'.repeat(64);

const { encryptToken, decryptToken } = await import('./crypto.js');

test('encrypt/decrypt round-trips', () => {
  const plain = 'ya29.super-secret-oauth-token';
  assert.equal(decryptToken(encryptToken(plain)), plain);
});

test('round-trips unicode + empty string', () => {
  assert.equal(decryptToken(encryptToken('שלום 🌿')), 'שלום 🌿');
  assert.equal(decryptToken(encryptToken('')), '');
});

test('ciphertext format is iv:tag:data (3 hex parts)', () => {
  const parts = encryptToken('x').split(':');
  assert.equal(parts.length, 3);
  parts.forEach((p) => assert.match(p, /^[0-9a-f]+$/));
});

test('uses a fresh IV each call (no deterministic ciphertext)', () => {
  assert.notEqual(encryptToken('same'), encryptToken('same'));
});

test('tampered ciphertext fails authentication', () => {
  const ct = encryptToken('tamper-me');
  const [iv, tag, data] = ct.split(':');
  const flipped = data.slice(0, -1) + (data.slice(-1) === '0' ? '1' : '0');
  assert.throws(() => decryptToken(`${iv}:${tag}:${flipped}`));
});

test('rejects malformed ciphertext', () => {
  assert.throws(() => decryptToken('not-valid'));
});

test('rejects a bad-length key', async () => {
  const saved = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = 'tooshort';
  assert.throws(() => encryptToken('x'), /64-character hex/);
  process.env.TOKEN_ENCRYPTION_KEY = saved;
});

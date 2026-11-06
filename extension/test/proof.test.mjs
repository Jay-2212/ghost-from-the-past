import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Load settings module which has proofFor
globalThis.GhostBlocklist = require('../lib/blocklist.js');
const settings = require('../lib/settings.js');

test('proofFor generates correct HMAC-SHA256 proof', async () => {
  const secret = 'test-secret';
  const origin = 'https://ghost.example.workers.dev';
  const nonce = '0'.repeat(32);
  const expected = '7e1fb1766fdca77fee4dd9d15899ceabc40b21974120bba690dd733b4a1d27b8';
  
  const proof = await settings.proofFor(secret, origin, nonce);
  assert.equal(proof, expected);
});

test('proofFor generates different proofs for different inputs', async () => {
  const proof1 = await settings.proofFor('secret1', 'https://a.workers.dev', '00');
  const proof2 = await settings.proofFor('secret2', 'https://a.workers.dev', '00');
  const proof3 = await settings.proofFor('secret1', 'https://b.workers.dev', '00');
  const proof4 = await settings.proofFor('secret1', 'https://a.workers.dev', '01');
  
  assert.notEqual(proof1, proof2);
  assert.notEqual(proof1, proof3);
  assert.notEqual(proof1, proof4);
});

test('newNonce generates 64-character hex string', () => {
  const nonce1 = settings.newNonce();
  const nonce2 = settings.newNonce();
  
  assert.equal(nonce1.length, 64);
  assert.equal(nonce2.length, 64);
  assert.match(nonce1, /^[0-9a-f]{64}$/);
  assert.match(nonce2, /^[0-9a-f]{64}$/);
  assert.notEqual(nonce1, nonce2);
});

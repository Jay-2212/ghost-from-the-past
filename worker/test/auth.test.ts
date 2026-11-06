import { describe, expect, it } from 'vitest';
import { extractBearer, verifyBearer, verifyProof } from '../src/auth';
import { secretConfigured, type Env } from '../src/env';

describe('verifyBearer', () => {
  it('compares against the trimmed secret, so a stored trailing newline does not reject everything', async () => {
    expect(await verifyBearer('Bearer s3cret-value', 's3cret-value\n')).toBe(true);
    expect(await verifyBearer('Bearer s3cret-value', '  s3cret-value \r\n')).toBe(true);
    expect(await verifyBearer('Bearer x', ' \n')).toBe(false);
  });

  it('accepts the right secret', async () => {
    expect(await verifyBearer('Bearer s3cret-value', 's3cret-value')).toBe(true);
    expect(await verifyBearer('bearer s3cret-value', 's3cret-value')).toBe(true);
  });
  it('rejects wrong, missing or malformed', async () => {
    expect(await verifyBearer('Bearer nope', 's3cret-value')).toBe(false);
    expect(await verifyBearer('Bearer s3cret-valu', 's3cret-value')).toBe(false);
    expect(await verifyBearer(null, 's3cret-value')).toBe(false);
    expect(await verifyBearer('Basic abc', 's3cret-value')).toBe(false);
    expect(await verifyBearer('Bearer x', undefined)).toBe(false);
  });
  it('extractBearer', () => {
    expect(extractBearer('Bearer abc')).toBe('abc');
    expect(extractBearer('Token abc')).toBeNull();
  });
});

describe('verifyProof', () => {
  it('generates correct HMAC-SHA256 proof', async () => {
    const secret = 'test-secret';
    const origin = 'https://ghost.example.workers.dev';
    const nonce = '0'.repeat(32);
    const expected = '7e1fb1766fdca77fee4dd9d15899ceabc40b21974120bba690dd733b4a1d27b8';
    
    const proof = await verifyProof(secret, origin, nonce);
    expect(proof).toBe(expected);
  });
  
  it('generates different proofs for different inputs', async () => {
    const proof1 = await verifyProof('secret1', 'https://a.workers.dev', '00');
    const proof2 = await verifyProof('secret2', 'https://a.workers.dev', '00');
    const proof3 = await verifyProof('secret1', 'https://b.workers.dev', '00');
    const proof4 = await verifyProof('secret1', 'https://a.workers.dev', '01');
    
    expect(proof1).not.toBe(proof2);
    expect(proof1).not.toBe(proof3);
    expect(proof1).not.toBe(proof4);
  });
});

describe('secretConfigured', () => {
  const mockEnv = (secret?: string): Env => ({
    GHOST_SECRET: secret,
  } as Env);

  it('accepts strong secrets', () => {
    expect(secretConfigured(mockEnv('a'.repeat(16)))).toBe(true);
    expect(secretConfigured(mockEnv('0123456789abcdef0123456789abcdef'))).toBe(true);
    expect(secretConfigured(mockEnv('  strong-secret-value  '))).toBe(true);
  });

  it('rejects missing or too short', () => {
    expect(secretConfigured(mockEnv())).toBe(false);
    expect(secretConfigured(mockEnv(''))).toBe(false);
    expect(secretConfigured(mockEnv('   '))).toBe(false);
    expect(secretConfigured(mockEnv('short'))).toBe(false);
    expect(secretConfigured(mockEnv('a'.repeat(15)))).toBe(false);
  });

  it('rejects known placeholders case-insensitively', () => {
    expect(secretConfigured(mockEnv('generate_with_openssl_rand_hex_32'))).toBe(false);
    expect(secretConfigured(mockEnv('Generate_With_Openssl_Rand_Hex_32'))).toBe(false);
    expect(secretConfigured(mockEnv('GENERATE_WITH_OPENSSL_RAND_HEX_32'))).toBe(false);
    expect(secretConfigured(mockEnv('your_secret_here'))).toBe(false);
    expect(secretConfigured(mockEnv('YOUR_SECRET_HERE'))).toBe(false);
    expect(secretConfigured(mockEnv('changeme'))).toBe(false);
    expect(secretConfigured(mockEnv('CHANGEME'))).toBe(false);
  });

  it('accepts similar but not exact placeholder strings', () => {
    // Typos or variations should pass (user responsibility)
    expect(secretConfigured(mockEnv('generate_with_openssl_rand_hex_33'))).toBe(true);
    expect(secretConfigured(mockEnv('your_secret_here_123'))).toBe(true);
  });
});

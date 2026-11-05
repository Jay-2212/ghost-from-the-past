import { describe, expect, it } from 'vitest';
import { extractBearer, verifyBearer } from '../src/auth';

describe('verifyBearer', () => {
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

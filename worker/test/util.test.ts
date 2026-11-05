import { describe, it, expect } from 'vitest';
import { rrf, humanReadableDuration, normaliseUrl, sha256Hex, pageIdFromUrl } from '../src/util';

describe('RRF Fusion', () => {
  it('combines BM25 and vector rankings', () => {
    const bm25 = [
      {id: 'a', score: 1.5},
      {id: 'b', score: 2.0},
      {id: 'c', score: 3.0}
    ];
    const vector = [
      {id: 'c', score: 0.95},
      {id: 'a', score: 0.80},
      {id: 'd', score: 0.85}
    ];

    const result = rrf(bm25, vector, 60);

    // Both lists have 'a' and 'c'; 'd' only in vector
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('handles empty lists', () => {
    const result = rrf([], [], 60);
    expect(result).toEqual([]);
  });
});

describe('humanReadableDuration', () => {
  it('formats milliseconds as seconds', () => {
    expect(humanReadableDuration(5000)).toBe('5s');
  });

  it('formats milliseconds as minutes and seconds', () => {
    const result = humanReadableDuration(252000); // 4m 12s
    expect(result).toMatch(/^4m 12s$/);
  });

  it('formats milliseconds as hours and minutes', () => {
    const result = humanReadableDuration(3720000); // 1h 2m
    expect(result).toMatch(/^1h 2m$/);
  });

  it('formats milliseconds as days', () => {
    const result = humanReadableDuration(86400000); // 1d
    expect(result).toMatch(/^1d/);
  });
});

describe('normaliseUrl', () => {
  it('lowercases hostname', () => {
    const result = normaliseUrl('https://Example.COM/page');
    expect(result).toContain('example.com');
  });

  it('removes fragment', () => {
    const result = normaliseUrl('https://example.com/page#section');
    expect(result).not.toContain('#');
  });

  it('removes utm parameters', () => {
    const result = normaliseUrl('https://example.com/page?utm_source=twitter&content=article');
    expect(result).not.toContain('utm_source');
    expect(result).toContain('content=article');
  });

  it('removes trailing slash except root', () => {
    expect(normaliseUrl('https://example.com/page/')).not.toEndWith('/');
    expect(normaliseUrl('https://example.com/')).toEndWith('/');
  });

  it('removes credential params', () => {
    const url = 'https://example.com/api?token=secret&access_token=token&other=value';
    const result = normaliseUrl(url);
    expect(result).not.toContain('token');
    expect(result).not.toContain('access_token');
    expect(result).toContain('other=value');
  });

  it('handles invalid URLs gracefully', () => {
    const result = normaliseUrl('not a url');
    expect(result).toBe('not a url');
  });
});

describe('sha256Hex', () => {
  it('returns hex string of SHA-256 hash', async () => {
    const hash = await sha256Hex('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Known SHA-256 of 'hello'
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('pageIdFromUrl', () => {
  it('returns first 16 chars of sha256(url)', async () => {
    const id = await pageIdFromUrl('https://example.com/article');
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(id.length).toBe(16);
  });

  it('is deterministic', async () => {
    const id1 = await pageIdFromUrl('https://example.com/article');
    const id2 = await pageIdFromUrl('https://example.com/article');
    expect(id1).toBe(id2);
  });
});

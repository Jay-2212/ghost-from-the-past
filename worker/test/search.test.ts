import { describe, expect, it } from 'vitest';
import { buildFtsQuery, parseBound } from '../src/search';

describe('buildFtsQuery', () => {
  it('quotes tokens and ORs them', () => {
    expect(buildFtsQuery('ghost folklore')).toBe('"ghost" OR "folklore"');
  });
  it('strips punctuation, quotes and FTS operators', () => {
    expect(buildFtsQuery('"NEAR(a b)" AND c* -d')).toBe('"near" OR "and"');
  });
  it('returns empty string when nothing usable', () => {
    expect(buildFtsQuery('  ?! ')).toBe('');
  });
  it('caps at 12 tokens and dedupes', () => {
    const q = buildFtsQuery(Array.from({ length: 30 }, (_, i) => `w${i} w${i}`).join(' '));
    expect(q.split(' OR ')).toHaveLength(12);
  });
  it('handles unicode', () => {
    expect(buildFtsQuery('भूत café')).toContain('"café"');
  });
});

describe('parseBound', () => {
  it('bare date start/end of day UTC', () => {
    expect(parseBound('2026-11-05', false)).toBe(Date.parse('2026-11-05T00:00:00Z'));
    expect(parseBound('2026-11-05', true)).toBe(Date.parse('2026-11-05T23:59:59.999Z'));
  });
  it('applies timezone offset to bare dates', () => {
    expect(parseBound('2026-11-05', false, 330)).toBe(Date.parse('2026-11-04T18:30:00Z'));
  });
  it('parses datetimes and rejects junk', () => {
    expect(parseBound('2026-11-05T10:00:00Z', false)).toBe(Date.parse('2026-11-05T10:00:00Z'));
    expect(parseBound('nope', false)).toBeUndefined();
    expect(parseBound(undefined, false)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { ingestPages } from '../src/ingest';

/** Minimal in-memory D1 stand-in: tracks page hashes and chunk rows, enough for ingestPages. */
function fakeDb(opts: { failChunkBatchOnce?: boolean } = {}) {
  const pages = new Map<string, string>(); // id -> content_hash
  const chunks = new Map<string, string>(); // chunk id -> page id
  let failNext = !!opts.failChunkBatchOnce;
  const stmt = (sql: string, args: any[] = []): any => ({
    sql,
    args,
    bind: (...a: any[]) => stmt(sql, a),
    first: async () => {
      if (sql.startsWith('SELECT id, content_hash FROM pages')) {
        const h = pages.get(args[0]);
        return h ? { id: args[0], content_hash: h } : null;
      }
      if (sql.includes('FROM chunks WHERE page_id')) {
        return [...chunks.values()].includes(args[0]) ? { one: 1 } : null;
      }
      return null;
    },
    run: async () => {
      if (sql.includes('INSERT INTO pages')) pages.set(args[0], args[7]);
      return { success: true };
    },
    all: async () => ({ results: [] }),
  });
  return {
    chunks,
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: any[]) => {
      if (stmts.some(s => s.sql.includes('INTO chunks ('))) {
        if (failNext) {
          failNext = false;
          throw new Error('simulated failure after page insert');
        }
        for (const s of stmts) if (s.sql.includes('INTO chunks (')) chunks.set(s.args[0], s.args[1]);
      }
      return [];
    },
  };
}

const page = { url: 'https://example.com/article', title: 'Article', markdown: '# Heading\n\nSome body text about ghosts.' };

describe('ingestPages', () => {
  it('writes chunks on the hash-match path when a failed earlier request left none', async () => {
    const db = fakeDb({ failChunkBatchOnce: true });
    const env: any = { DB: db, EMBED_MODE: 'mock', VECTOR_MODE: 'd1' };

    const [failed] = await ingestPages(env, [page]);
    expect(failed).toMatchObject({ url: page.url, status: 'error' });
    expect(db.chunks.size).toBe(0);

    const [r] = await ingestPages(env, [page]);
    expect(r.status).toBe('merged');
    expect(r.chunks).toBeGreaterThan(0);
    expect(db.chunks.size).toBe(r.chunks);
  });

  it('does not rewrite chunks on the hash-match path when they already exist', async () => {
    const db = fakeDb();
    const env: any = { DB: db, EMBED_MODE: 'mock', VECTOR_MODE: 'd1' };
    const [first] = await ingestPages(env, [page]);
    expect(first.status).toBe('created');
    const [second] = await ingestPages(env, [page]);
    expect(second).toMatchObject({ status: 'merged', chunks: 0 });
  });

  it('reports a throwing page as error and still ingests the rest of the batch', async () => {
    const db = fakeDb({ failChunkBatchOnce: true });
    const env: any = { DB: db, EMBED_MODE: 'mock', VECTOR_MODE: 'd1' };
    const other = { url: 'https://example.com/other', title: 'Other', markdown: '# Other\n\nMore text.' };
    const third = { url: 'https://example.com/third', title: 'Third', markdown: '# Third\n\nEven more.' };
    const results = await ingestPages(env, [page, other, third]);
    expect(results.map(r => r.status)).toEqual(['error', 'created', 'created']);
    expect(results[0].url).toBe(page.url);
  });
});

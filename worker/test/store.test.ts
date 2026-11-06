import { describe, expect, it, vi } from 'vitest';
import { D1VectorStore, D1_VECTOR_MAX_ROWS } from '../src/store';

function fakeDb(n: number) {
  const all = vi.fn(async () => ({ results: [{ chunk_id: 'c1', vector: '[1,0]' }, { chunk_id: 'c2', vector: '[0,1]' }] }));
  return {
    all,
    prepare: (sql: string) => sql.startsWith('SELECT COUNT') ? { first: async () => ({ n }) } : { all },
  };
}

describe('D1VectorStore.query', () => {
  it('ranks vectors under the row cap', async () => {
    const db = fakeDb(2);
    const r = await new D1VectorStore(db).query([1, 0], 1);
    expect(r.map(x => x.id)).toEqual(['c1']);
  });

  it('returns [] without loading rows above the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeDb(D1_VECTOR_MAX_ROWS + 1);
    expect(await new D1VectorStore(db).query([1, 0], 5)).toEqual([]);
    expect(db.all).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

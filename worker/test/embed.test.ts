import { describe, expect, it } from 'vitest';
import { HashEmbedder, createEmbedder, WorkersAiEmbedder } from '../src/embed';

describe('HashEmbedder', () => {
  const e = new HashEmbedder();
  it('is deterministic, 384-dim and unit length', async () => {
    const a = await e.embed('the ghost remembers every page');
    const b = await e.embed('the ghost remembers every page');
    expect(a).toEqual(b);
    expect(a).toHaveLength(384);
    expect(Math.sqrt(a.reduce((s, v) => s + v * v, 0))).toBeCloseTo(1, 6);
  });
  it('similar texts score higher than unrelated ones', async () => {
    const [q, near, far] = await e.embedBatch(['ghost folklore', 'folklore about a ghost', 'stock market prices today']);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(q, near)).toBeGreaterThan(dot(q, far));
  });
});

describe('createEmbedder', () => {
  it('uses the mock without AI binding or in mock mode', () => {
    expect(createEmbedder({})).toBeInstanceOf(HashEmbedder);
    expect(createEmbedder({ AI: {}, EMBED_MODE: 'mock' })).toBeInstanceOf(HashEmbedder);
    expect(createEmbedder({ AI: {} })).toBeInstanceOf(WorkersAiEmbedder);
  });
  it('WorkersAiEmbedder unpacks {data: number[][]}', async () => {
    const fake = { run: async (_m: string, i: { text: string[] }) => ({ shape: [i.text.length, 2], data: i.text.map(() => [0.1, 0.2]) }) };
    const w = new WorkersAiEmbedder(fake as any);
    expect(await w.embedBatch(['a', 'b'])).toEqual([[0.1, 0.2], [0.1, 0.2]]);
  });
});

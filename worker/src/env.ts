import { createEmbedder, type Embedder } from './embed';
import { D1VectorStore, VectorizeStore, type VectorStore } from './store';

export interface Env {
  DB: D1Database;
  VECTORS?: VectorizeIndex;
  AI?: Ai;
  GHOST_SECRET?: string;
  EMBED_MODE?: string;
  VECTOR_MODE?: string;
  EMBED_MODEL?: string;
  MAX_CHUNKS_PER_PAGE?: string;
}

export const VERSION = '1.0.0';

export function vectorMode(env: Env): 'vectorize' | 'd1' {
  return env.VECTOR_MODE === 'd1' || !env.VECTORS ? 'd1' : 'vectorize';
}

export function embedMode(env: Env): 'workers-ai' | 'mock' {
  return env.EMBED_MODE === 'mock' || !env.AI ? 'mock' : 'workers-ai';
}

export function getStores(env: Env): { embedder: Embedder; vectors: VectorStore } {
  const embedder = createEmbedder(env as any);
  const vectors: VectorStore =
    vectorMode(env) === 'd1' ? new D1VectorStore(env.DB) : new VectorizeStore(env.VECTORS);
  return { embedder, vectors };
}

export function maxChunks(env: Env): number {
  const n = parseInt(env.MAX_CHUNKS_PER_PAGE ?? '8', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32) : 8;
}

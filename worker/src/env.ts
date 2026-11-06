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
  ALLOW_QUERY_TOKEN?: string;
  LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export const VERSION = '1.0.0';

const PLACEHOLDER_SECRETS = ['generate_with_openssl_rand_hex_32', 'your_secret_here', 'changeme'];

export function secretConfigured(env: Env): boolean {
  if (!env.GHOST_SECRET || typeof env.GHOST_SECRET !== 'string') return false;
  const trimmed = env.GHOST_SECRET.trim();
  if (trimmed.length < 16) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_SECRETS.some(p => lower === p);
}

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

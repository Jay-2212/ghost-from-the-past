/**
 * Embedder interface and implementations: WorkersAiEmbedder and HashEmbedder.
 */

export interface Embedder {
  /**
   * Embed a single text string to 384-dimensional vector.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embed multiple texts in a single batch call.
   * Returns one embedding per text.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * WorkersAiEmbedder: uses Cloudflare Workers AI with bge-small-en-v1.5 (384 dims).
 * Workers AI returns {shape: [n, 384], data: number[][]}.
 */
export class WorkersAiEmbedder implements Embedder {
  constructor(private ai: any, private model: string = '@cf/baai/bge-small-en-v1.5') {}

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.ai.run(this.model, {
      text: texts
    });

    // Workers AI bge-small returns {shape: [n, 384], data: number[][]}
    if (response && response.data && Array.isArray(response.data)) {
      return response.data;
    }

    throw new Error('Invalid Workers AI response format');
  }
}

/**
 * HashEmbedder: deterministic embedding using hashed bag-of-words.
 * Useful for local development and fallback when AI is unavailable.
 * Returns L2-normalized 384-dimensional vectors.
 */
export class HashEmbedder implements Embedder {
  constructor() {}

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = this.hashEmbedding(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  private hashEmbedding(text: string): number[] {
    // Extract words using regex (letters and numbers)
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));

    // Create 384-dimensional vector from word hashes
    const vec = new Array(384).fill(0);

    for (const word of uniqueWords) {
      const hash = this.simpleHash(word);
      const idx = Math.abs(hash) % 384;
      vec[idx] += 1;
    }

    // L2 normalization
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= magnitude;
      }
    }

    return vec;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

/**
 * Create embedder based on environment.
 */
export function createEmbedder(env: {AI?: any; EMBED_MODE?: string; EMBED_MODEL?: string}): Embedder {
  const embedMode = env.EMBED_MODE || 'ai';
  const model = env.EMBED_MODEL || '@cf/baai/bge-small-en-v1.5';

  if (embedMode === 'mock' || !env.AI) {
    return new HashEmbedder();
  }

  return new WorkersAiEmbedder(env.AI, model);
}

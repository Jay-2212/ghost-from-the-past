/**
 * VectorStore interface and implementations: VectorizeStore and D1VectorStore.
 */

export interface VectorStoreItem {
  id: string;
  pageId: string;
  values: number[];
}

export interface VectorQueryResult {
  id: string;
  score: number;
}

export interface VectorStore {
  /**
   * Upsert vectors for multiple chunks.
   */
  upsert(items: VectorStoreItem[]): Promise<void>;

  /**
   * Query for top-k similar vectors.
   */
  query(values: number[], topK: number): Promise<VectorQueryResult[]>;

  /**
   * Delete vectors by chunk IDs.
   */
  deleteByIds(ids: string[]): Promise<void>;
}

/**
 * VectorizeStore: uses Cloudflare Vectorize index.
 */
export class VectorizeStore implements VectorStore {
  constructor(private vectorize: any) {} // R2 or Vectorize binding

  async upsert(items: VectorStoreItem[]): Promise<void> {
    if (items.length === 0) return;

    const vectors = items.map(item => ({
      id: item.id,
      values: item.values
    }));

    await this.vectorize.upsert(vectors);
  }

  async query(values: number[], topK: number): Promise<VectorQueryResult[]> {
    // Hark fix: Vectorize query() resolves to {matches, count}, not an array.
    const res = await this.vectorize.query(values, { topK });
    return (res?.matches ?? []).map((m: any) => ({
      id: m.id,
      score: m.score
    }));
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.vectorize.deleteByIds(ids);
  }
}

/**
 * D1VectorStore: stores vectors as JSON in D1 chunk_vectors table, brute-force cosine similarity.
 */
export class D1VectorStore implements VectorStore {
  constructor(private db: any) {} // D1 binding

  async upsert(items: VectorStoreItem[]): Promise<void> {
    if (items.length === 0) return;

    // Hark fix: D1 batch() takes prepared statements, not {sql, params} objects.
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO chunk_vectors (chunk_id, page_id, vector) VALUES (?, ?, ?)'
    );
    await this.db.batch(items.map(item => stmt.bind(item.id, item.pageId, JSON.stringify(item.values))));
  }

  async query(values: number[], topK: number): Promise<VectorQueryResult[]> {
    const result = await this.db
      .prepare('SELECT chunk_id, vector FROM chunk_vectors')
      .all();

    if (!result.results) return [];

    // Brute-force cosine similarity
    const scores = result.results.map((row: any) => ({
      id: row.chunk_id,
      score: cosineSimilarity(values, JSON.parse(row.vector))
    }));

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    await this.db
      .prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`)
      .bind(...ids)
      .run();
  }
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

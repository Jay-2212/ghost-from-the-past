import { chunkMarkdown, embedText } from './chunk';
import { getStores, maxChunks, type Env } from './env';
import { normaliseUrl, pageIdFromUrl, sha256Hex } from './util';

export const MAX_MARKDOWN = 200_000;
export const MAX_PAGES_PER_BATCH = 25;

export interface IncomingPage {
  url: string;
  title?: string;
  domain?: string;
  markdown: string;
  excerpt?: string;
  lang?: string;
  kind?: string;
  meta?: Record<string, unknown> | null;
  firstSeen?: number;
  lastSeen?: number;
  activeMsDelta?: number;
}

export interface IngestResult {
  url: string;
  id?: string;
  status: 'created' | 'merged' | 'updated' | 'skipped';
  chunks?: number;
  vector?: boolean;
  reason?: string;
}

const KIND_RE = /^[a-z0-9-]{1,40}$/;

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.min(max, Math.max(min, n));
}

export function validatePage(p: any): { ok: true; page: IncomingPage } | { ok: false; reason: string } {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'not an object' };
  if (typeof p.url !== 'string') return { ok: false, reason: 'url missing' };
  let u: URL;
  try {
    u = new URL(p.url);
  } catch {
    return { ok: false, reason: 'invalid url' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'unsupported protocol' };
  if (typeof p.markdown !== 'string' || !p.markdown.trim()) return { ok: false, reason: 'markdown missing' };
  return { ok: true, page: p as IncomingPage };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function chunkIdsFor(env: Env, pageIds: string[]): Promise<string[]> {
  if (!pageIds.length) return [];
  const q = pageIds.map(() => '?').join(',');
  const r = await env.DB.prepare(`SELECT id FROM chunks WHERE page_id IN (${q})`).bind(...pageIds).all<{ id: string }>();
  return (r.results ?? []).map(x => x.id);
}

/** Delete all chunk-level data (chunks, FTS rows, vectors) for the given pages. Pages themselves are kept. */
export async function deleteChunkData(env: Env, pageIds: string[]): Promise<void> {
  if (!pageIds.length) return;
  const ids = await chunkIdsFor(env, pageIds);
  const { vectors } = getStores(env);
  if (ids.length) {
    try {
      // Vectorize deleteByIds accepts up to 1000 ids per call
      for (let i = 0; i < ids.length; i += 500) await vectors.deleteByIds(ids.slice(i, i + 500));
    } catch (e) {
      console.warn('vector delete failed', (e as Error).message);
    }
  }
  const q = pageIds.map(() => '?').join(',');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM chunks_fts WHERE page_id IN (${q})`).bind(...pageIds),
    env.DB.prepare(`DELETE FROM chunk_vectors WHERE page_id IN (${q})`).bind(...pageIds),
    env.DB.prepare(`DELETE FROM chunks WHERE page_id IN (${q})`).bind(...pageIds),
  ]);
}

async function writeChunks(env: Env, pageId: string, title: string, markdown: string): Promise<{ chunks: number; vector: boolean }> {
  const chunks = chunkMarkdown(markdown, title, maxChunks(env));
  if (!chunks.length) return { chunks: 0, vector: false };
  const ins = env.DB.prepare('INSERT OR REPLACE INTO chunks (id, page_id, idx, text) VALUES (?, ?, ?, ?)');
  const fts = env.DB.prepare('INSERT INTO chunks_fts (text, chunk_id, page_id) VALUES (?, ?, ?)');
  const stmts: D1PreparedStatement[] = [];
  for (const c of chunks) {
    const id = `${pageId}-${c.idx}`;
    stmts.push(ins.bind(id, pageId, c.idx, c.text));
    stmts.push(fts.bind(`${title}\n${c.text}`, id, pageId));
  }
  await env.DB.batch(stmts);

  // Embeddings are best-effort: a failure never loses the page (FTS still works).
  try {
    const { embedder, vectors } = getStores(env);
    const embs = await embedder.embedBatch(chunks.map(c => embedText(title, c)));
    await vectors.upsert(chunks.map((c, i) => ({ id: `${pageId}-${c.idx}`, pageId, values: embs[i] })));
    return { chunks: chunks.length, vector: true };
  } catch (e) {
    console.warn('embedding failed', (e as Error).message);
    return { chunks: chunks.length, vector: false };
  }
}

export async function ingestPages(env: Env, rawPages: unknown[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  const now = Date.now();
  for (const raw of rawPages) {
    const v = validatePage(raw);
    if (!v.ok) {
      results.push({ url: String((raw as any)?.url ?? ''), status: 'skipped', reason: v.reason });
      continue;
    }
    const p = v.page;
    const url = normaliseUrl(p.url);
    const id = await pageIdFromUrl(url);
    const markdown = p.markdown.slice(0, MAX_MARKDOWN);
    const hash = await sha256Hex(markdown);
    const title = (p.title || url).slice(0, 500);
    const domain = (p.domain || domainOf(url)).slice(0, 255);
    const firstSeen = clampInt(p.firstSeen, now, 0, now + 86_400_000);
    const lastSeen = clampInt(p.lastSeen, firstSeen, firstSeen, now + 86_400_000);
    const delta = clampInt(p.activeMsDelta, 0, 0, 86_400_000);
    const kind = typeof p.kind === 'string' && KIND_RE.test(p.kind) ? p.kind : 'article';
    const meta = p.meta && typeof p.meta === 'object' ? JSON.stringify(p.meta).slice(0, 4000) : null;
    const excerpt = (p.excerpt || '').slice(0, 500);
    const lang = (p.lang || '').slice(0, 20);
    const words = markdown.split(/\s+/).filter(Boolean).length;

    const existing = await env.DB.prepare('SELECT id, content_hash FROM pages WHERE id = ?').bind(id).first<{ id: string; content_hash: string }>();

    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO pages (id, url, title, domain, excerpt, lang, content_md, content_hash, word_count,
           first_seen, last_seen, active_ms, visits, created_at, updated_at, kind, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      )
        .bind(id, url, title, domain, excerpt, lang, markdown, hash, words, firstSeen, lastSeen, delta, now, now, kind, meta)
        .run();
      const w = await writeChunks(env, id, title, markdown);
      results.push({ url, id, status: 'created', ...w });
      continue;
    }

    const merge = env.DB.prepare(
      `UPDATE pages SET first_seen = MIN(first_seen, ?), last_seen = MAX(last_seen, ?),
         active_ms = active_ms + ?, visits = visits + 1, title = ?, updated_at = ? WHERE id = ?`
    ).bind(firstSeen, lastSeen, delta, title, now, id);

    if (existing.content_hash === hash) {
      await merge.run();
      // A previous request may have inserted the page row and then failed before writing chunks;
      // without this the page would never reach FTS/vector search.
      const hasChunk = await env.DB.prepare('SELECT 1 AS one FROM chunks WHERE page_id = ? LIMIT 1').bind(id).first();
      if (!hasChunk) {
        const w = await writeChunks(env, id, title, markdown);
        results.push({ url, id, status: 'merged', ...w });
      } else {
        results.push({ url, id, status: 'merged', chunks: 0 });
      }
      continue;
    }

    await deleteChunkData(env, [id]);
    await env.DB.batch([
      merge,
      env.DB.prepare(
        `UPDATE pages SET content_md = ?, content_hash = ?, word_count = ?, excerpt = ?, lang = ?, kind = ?, meta = ?, domain = ? WHERE id = ?`
      ).bind(markdown, hash, words, excerpt, lang, kind, meta, domain, id),
    ]);
    const w = await writeChunks(env, id, title, markdown);
    results.push({ url, id, status: 'updated', ...w });
  }
  return results;
}

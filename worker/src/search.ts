import { getStores, embedMode, vectorMode, type Env } from './env';
import { deleteChunkData } from './ingest';
import { humanReadableDuration, normaliseUrl, rrf } from './util';

/** Build a safe FTS5 MATCH expression: word tokens, quoted, OR-ed. '' when nothing usable. */
export function buildFtsQuery(q: string): string {
  const toks = (q || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const uniq = [...new Set(toks)].filter(t => t.length > 1 || /\p{N}/u.test(t)).slice(0, 12);
  return uniq.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

/**
 * Parse an ISO date or datetime. A bare date (YYYY-MM-DD) as an upper bound means the end of that day.
 * tzOffsetMinutes shifts bare dates (e.g. 330 for IST) so "today" matches the user's day.
 */
export function parseBound(v: string | undefined, end: boolean, tzOffsetMinutes = 0): number | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const base = Date.parse(`${s}T00:00:00Z`) - tzOffsetMinutes * 60_000;
    if (Number.isNaN(base)) return undefined;
    return end ? base + 86_400_000 - 1 : base;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

export interface Filters {
  from?: string;
  to?: string;
  domain?: string;
  kind?: string;
  tzOffsetMinutes?: number;
}

function filterSql(f: Filters, alias = 'p'): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  const from = parseBound(f.from, false, f.tzOffsetMinutes);
  const to = parseBound(f.to, true, f.tzOffsetMinutes);
  if (from !== undefined && to !== undefined) {
    parts.push(`((${alias}.first_seen BETWEEN ? AND ?) OR (${alias}.last_seen BETWEEN ? AND ?) OR (${alias}.first_seen < ? AND ${alias}.last_seen > ?))`);
    args.push(from, to, from, to, from, to);
  } else if (from !== undefined) {
    parts.push(`${alias}.last_seen >= ?`);
    args.push(from);
  } else if (to !== undefined) {
    parts.push(`${alias}.first_seen <= ?`);
    args.push(to);
  }
  if (f.domain) {
    const d = f.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    parts.push(`(${alias}.domain = ? OR ${alias}.domain LIKE ?)`);
    args.push(d, `%.${d}`);
  }
  if (f.kind) {
    parts.push(`${alias}.kind = ?`);
    args.push(f.kind);
  }
  return { sql: parts.length ? parts.join(' AND ') : '1=1', args };
}

export interface PageRow {
  id: string;
  url: string;
  title: string;
  domain: string;
  kind: string;
  meta: string | null;
  first_seen: number;
  last_seen: number;
  active_ms: number;
  visits: number;
  word_count: number;
}

export function pageSummary(r: PageRow) {
  let meta: Record<string, unknown> | undefined;
  try {
    meta = r.meta ? JSON.parse(r.meta) : undefined;
  } catch {
    meta = undefined;
  }
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    domain: r.domain,
    kind: r.kind,
    ...(meta ? { meta } : {}),
    firstSeen: new Date(r.first_seen).toISOString(),
    lastSeen: new Date(r.last_seen).toISOString(),
    activeMs: r.active_ms,
    timeSpent: humanReadableDuration(r.active_ms),
    visits: r.visits,
  };
}

const PAGE_COLS = 'p.id, p.url, p.title, p.domain, p.kind, p.meta, p.first_seen, p.last_seen, p.active_ms, p.visits, p.word_count';

function snippet(text: string, query: string, max = 320): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const toks = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(t => t.length > 2);
  const lower = clean.toLowerCase();
  let pos = -1;
  for (const t of toks) {
    pos = lower.indexOf(t);
    if (pos >= 0) break;
  }
  const start = Math.max(0, Math.min(clean.length - max, pos < 0 ? 0 : pos - 80));
  return (start > 0 ? '…' : '') + clean.slice(start, start + max - 2).trim() + '…';
}

export async function hybridSearch(env: Env, args: Filters & { query: string; limit?: number }) {
  const limit = Math.min(25, Math.max(1, args.limit ?? 8));
  const ftsQ = buildFtsQuery(args.query);
  let fts: { id: string; score: number }[] = [];
  if (ftsQ) {
    try {
      const r = await env.DB.prepare(
        `SELECT chunk_id, bm25(chunks_fts) AS s FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY s LIMIT 40`
      ).bind(ftsQ).all<{ chunk_id: string; s: number }>();
      fts = (r.results ?? []).map(x => ({ id: x.chunk_id, score: x.s }));
    } catch (e) {
      console.warn('fts failed', (e as Error).message);
    }
  }
  let vec: { id: string; score: number }[] = [];
  try {
    const { embedder, vectors } = getStores(env);
    const v = await embedder.embed(args.query);
    vec = (await vectors.query(v, 40)).filter(m => m.score > 0);
  } catch (e) {
    console.warn('vector search failed', (e as Error).message);
  }
  const fused = rrf(fts, vec, 60).slice(0, 80);
  if (!fused.length) return [];

  const ids = fused.map(f => f.id);
  const f = filterSql(args);
  const rows = await env.DB.prepare(
    `SELECT c.id AS chunk_id, c.text, ${PAGE_COLS} FROM chunks c JOIN pages p ON p.id = c.page_id
     WHERE c.id IN (${ids.map(() => '?').join(',')}) AND ${f.sql}`
  ).bind(...ids, ...f.args).all<PageRow & { chunk_id: string; text: string }>();
  const byChunk = new Map((rows.results ?? []).map(r => [r.chunk_id, r]));

  const seen = new Set<string>();
  const out = [];
  for (const { id, score } of fused) {
    const r = byChunk.get(id);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ ...pageSummary(r), snippet: snippet(r.text, args.query), score: Number(score.toFixed(5)) });
    if (out.length >= limit) break;
  }
  return out;
}

export async function listPages(env: Env, args: Filters & { date?: string; limit?: number; offset?: number }) {
  const limit = Math.min(100, Math.max(1, args.limit ?? 25));
  const offset = Math.max(0, args.offset ?? 0);
  const filters: Filters = { ...args };
  if (args.date) {
    filters.from = args.date;
    filters.to = args.date;
  }
  const f = filterSql(filters);
  const r = await env.DB.prepare(
    `SELECT ${PAGE_COLS} FROM pages p WHERE ${f.sql} ORDER BY p.last_seen DESC LIMIT ? OFFSET ?`
  ).bind(...f.args, limit, offset).all<PageRow>();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pages p WHERE ${f.sql}`).bind(...f.args).first<{ n: number }>();
  return { total: total?.n ?? 0, pages: (r.results ?? []).map(pageSummary) };
}

export async function getPage(env: Env, args: { url?: string; id?: string }) {
  let row: (PageRow & { content_md: string }) | null = null;
  if (args.id) {
    row = await env.DB.prepare(`SELECT ${PAGE_COLS}, p.content_md FROM pages p WHERE p.id = ?`).bind(args.id).first();
  }
  if (!row && args.url) {
    row = await env.DB.prepare(`SELECT ${PAGE_COLS}, p.content_md FROM pages p WHERE p.url = ?`).bind(normaliseUrl(args.url)).first();
    if (!row) row = await env.DB.prepare(`SELECT ${PAGE_COLS}, p.content_md FROM pages p WHERE p.url = ?`).bind(args.url).first();
  }
  if (!row) return null;
  return { ...pageSummary(row), markdown: row.content_md };
}

export async function forget(env: Env, args: { ids?: string[]; url?: string }) {
  let ids: string[] = [];
  if (args.ids) {
    const want = [...new Set(args.ids)];
    if (want.length === 0) return { deleted: 0 }; // never build `IN ()`
    // Verify that these ids exist in the database
    const placeholders = want.map(() => '?').join(',');
    const r = await env.DB.prepare(`SELECT id FROM pages WHERE id IN (${placeholders})`).bind(...want).all<{ id: string }>();
    ids = (r.results ?? []).map(x => x.id);
  } else if (args.url) {
    const r = await env.DB.prepare('SELECT id FROM pages WHERE url = ? OR url = ?').bind(normaliseUrl(args.url), args.url).all<{ id: string }>();
    ids = (r.results ?? []).map(x => x.id);
  } else {
    throw new Error('forget needs ids or url');
  }
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    await deleteChunkData(env, batch);
    await env.DB.prepare(`DELETE FROM pages WHERE id IN (${batch.map(() => '?').join(',')})`).bind(...batch).run();
  }
  return { deleted: ids.length };
}

export async function stats(env: Env) {
  const p = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(last_seen) AS last, COALESCE(SUM(active_ms),0) AS t FROM pages').first<{ n: number; last: number | null; t: number }>();
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM chunks').first<{ n: number }>();
  const d = await env.DB.prepare('SELECT domain, COUNT(*) AS pages, SUM(active_ms) AS ms FROM pages GROUP BY domain ORDER BY pages DESC LIMIT 10').all<{ domain: string; pages: number; ms: number }>();
  const k = await env.DB.prepare('SELECT kind, COUNT(*) AS pages FROM pages GROUP BY kind ORDER BY pages DESC').all<{ kind: string; pages: number }>();
  return {
    pages: p?.n ?? 0,
    chunks: c?.n ?? 0,
    lastSeen: p?.last ? new Date(p.last).toISOString() : null,
    totalActiveMs: p?.t ?? 0,
    totalTimeSpent: humanReadableDuration(p?.t ?? 0),
    topDomains: (d.results ?? []).map(x => ({ domain: x.domain, pages: x.pages, timeSpent: humanReadableDuration(x.ms ?? 0) })),
    kinds: k.results ?? [],
    vectorMode: vectorMode(env),
    embedMode: embedMode(env),
  };
}

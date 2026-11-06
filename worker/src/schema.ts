// Schema safety net: ensures tables exist at runtime, in case migrations were not applied.
// This mirrors worker/migrations/0001_init.sql exactly (keep them in sync).

// IMPORTANT: The statements below MUST match worker/migrations/0001_init.sql exactly.
// If you update 0001_init.sql or add new migrations, update this array too.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  domain TEXT,
  excerpt TEXT,
  lang TEXT,
  content_md TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  word_count INTEGER,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  active_ms INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'article',
  meta TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_first_seen ON pages(first_seen)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_last_seen ON pages(last_seen)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_kind ON pages(kind)`,
  `CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_page_id ON chunks(page_id)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  chunk_id UNINDEXED,
  page_id UNINDEXED,
  tokenize='porter unicode61'
)`,
  `CREATE TABLE IF NOT EXISTS chunk_vectors (
  chunk_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  vector TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_chunk_vectors_page_id ON chunk_vectors(page_id)`,
];

// Module-level memo: once the schema is confirmed, we never check again in this isolate.
let schemaMemo: Promise<void> | null = null;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaMemo) return schemaMemo;

  schemaMemo = (async () => {
    // Check if the pages table exists
    const result = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pages'`)
      .first<{ name: string }>();

    if (result?.name === 'pages') {
      // Schema already exists
      return;
    }

    // Schema missing: apply DDL statements
    const statements = SCHEMA_DDL.map(sql => db.prepare(sql));
    await db.batch(statements);
  })();

  try {
    await schemaMemo;
  } catch (e) {
    // Reset memo on failure so next request retries
    schemaMemo = null;
    throw e;
  }
}

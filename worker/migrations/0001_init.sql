-- Ghost from the Past - Initial D1 Schema

-- Pages table: stores extracted web pages
CREATE TABLE IF NOT EXISTS pages (
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
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_first_seen ON pages(first_seen);
CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain);
CREATE INDEX IF NOT EXISTS idx_pages_last_seen ON pages(last_seen);

-- Chunks table: stores text chunks with reference to parent page
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES pages(id)
);

CREATE INDEX IF NOT EXISTS idx_chunks_page_id ON chunks(page_id);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  chunk_id UNINDEXED,
  page_id UNINDEXED,
  tokenize='porter unicode61'
);

-- Vector storage table: fallback when Vectorize unavailable (D1VectorStore)
CREATE TABLE IF NOT EXISTS chunk_vectors (
  chunk_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  vector TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES pages(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

CREATE INDEX IF NOT EXISTS idx_chunk_vectors_page_id ON chunk_vectors(page_id);

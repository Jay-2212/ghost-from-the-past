# Ghost from the Past — Architecture & Design

## System Architecture

```
┌──────────────────────┐
│   Chrome Browser     │
│  ┌────────────────┐  │
│  │ Content Script │──────────────┐
│  └────────────────┘  │           │
│  ┌────────────────┐  │           │
│  │  Background SW │──┼─────┐     │
│  └────────────────┘  │     │     │
│  ┌────────────────┐  │     │     │
│  │ Popup / Options│  │     │     │
│  └────────────────┘  │     │     │
└──────────────────────┘     │     │
                             │     │ JSON over HTTPS
                          ┌──▼─────▼──┐
                          │  Worker    │ (Cloudflare)
                          │ (TypeScript)
                          │  /ingest   │
                          │  /api/*    │
                          │  /mcp      │ (MCP SDK)
                          └──────┬─────┘
                                 │
                   ┌─────────────┼─────────────┐
                   │             │             │
                ┌──▼──┐   ┌──────▼──┐   ┌─────▼─────┐
                │ D1  │   │Vectorize│   │Workers AI │
                │(SQL)│   │(Semantic)   │(Embeddings)
                └─────┘   └─────────┘   └───────────┘

┌──────────────────────┐
│   AI Client          │ (Claude, Kiro, Cursor, etc.)
│   (MCP HTTP)         │
└──────────┬───────────┘
           │
           │ Authorization: Bearer {secret}
           │
        /mcp endpoint (Worker)
```

## Component & Module List

### Extension (Plain JS ES2022)

**lib/extract.js** (UMD, globalThis.GhostExtract)
- `extract(doc)` → `{title, excerpt, markdown, lang}` or null
- `stripPre(doc)` → cloned doc with nav/ads/forms removed
- `turndownToMarkdown(html)` → string (ATX headings, code fences, `-` bullets)

**lib/redact.js** (UMD, globalThis.GhostRedact)
- `redactPage(markdown, settings)` → string with redacted content
- `redactLuhn(text)` → card numbers → `[redacted-card]`
- `redactSecrets(text)` → tokens → `[redacted-secret]`
- `redactEmails(text)` → emails → `[redacted-email]`
- `redactSSN(text)` → SSN-like → `[redacted-id]`

**lib/blocklist.js** (UMD, globalThis.GhostBlocklist)
- `matches(url, patterns)` → boolean
- `normalisePattern(pattern)` → domain or glob

**lib/settings.js** (ES module)
- `loadSettings()` → settings object (from sync storage)
- `saveSettings(obj)` → void
- `defaultBlocklist()` → array of patterns

**content.js** (Classic script, injected at document_idle; MV3 content scripts cannot be modules)
- Visibility & focus tracking → sends `{type:'ghost:time', url, deltaMs}` every 15s
- URL polling for SPA detection
- Readability + Turndown extraction → sends `{type:'ghost:page', page}`

**background.js** (Service Worker, type: module)
- Listens to `ghost:page` and `ghost:time` messages
- Maintains queue in `chrome.storage.local.queue` (URL-keyed)
- Applies redaction, enforces `minDwellMs`, drops stale entries
- `chrome.alarms` listener for `ghost-sync` every 5 min
- Sends `POST /ingest` with bearer auth; updates stats on success/failure

**popup.js/popup.html**
- Display status pill, stats, buttons (Pause, Resume, Sync, Settings)
- Show "Connect Worker" if unconfigured

**options.js/options.html**
- Worker URL + Secret fields, Test Connection button
- Redact emails toggle, min dwell input, blocklist textarea
- Recently remembered list (from queue/stats)

### Worker (TypeScript, Cloudflare)

**src/index.ts** (Router)
- `GET /` → health HTML
- `GET /health` → JSON health
- `OPTIONS *` → CORS preflight
- `POST /ingest` → auth → call `ingestPages()`
- `GET /api/stats` → auth → call `getStats()`
- `ALL /mcp` → auth (header or query token) → call `handleMcp()`

**src/auth.ts**
- `verifyBearer(header, secret)` → boolean (timingSafeEqual on SHA-256)
- `hashSecret(secret)` → hex string

**src/ingest.ts**
- `normaliseUrl(url)` → string (lowercase, no hash, no utm params, no trailing /)
- `ingestPages(pages, db, vectorStore, embedder)` → result object with status per page

**src/store.ts**
- `interface VectorStore` → `upsert(items:{id,pageId,values:number[]}[])`, `query(values, topK)` → {id,score}[], `deleteByIds(ids:string[])`
- Fetch chunk ids from D1 BEFORE deleting pages so vectors can be deleted (no FK cascades)
- `class VectorizeStore implements VectorStore` → uses env.VECTORS
- `class D1VectorStore implements VectorStore` → uses D1 chunk_vectors table

**src/embed.ts**
- `interface Embedder` → `embed(text)` → Float32Array (384 dims), and `embedBatch(texts:string[])` → Promise<number[][]> (one AI call per batch)
- `class WorkersAiEmbedder implements Embedder` → uses env.AI + @cf/baai/bge-small-en-v1.5, returns {shape, data:number[][]}
- `class HashEmbedder implements Embedder` → deterministic hash, L2-normalised

**src/chunk.ts** (Pure)
- `chunkMarkdown(markdown, title, maxChunks)` → chunk[] with text, heading, index
- Respects headings, blank lines, max size 1200, target 900, overlap 120

**src/search.ts**
- `hybridSearch(query, db, vectorStore, embedder, filters)` → ranked results
- BM25 top 30 + vector top 30 → RRF (k=60) → filter & group → top N

**src/mcp.ts** (MCP SDK)
- Fresh `McpServer` per request
- Tools: `search_memory`, `list_pages`, `get_page`, `forget`, `memory_stats`
- All return text + structuredContent

**src/util.ts**
- `rrf(bm25Results, vectorResults, k)` → fused ranking
- `humanReadableDuration(ms)` → "4m 12s"

## D1 Schema & Queries

```sql
-- Pages table
CREATE TABLE pages (
  id TEXT PRIMARY KEY,              -- hex(sha256(normalised_url))[:16]
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  domain TEXT,
  excerpt TEXT,
  lang TEXT,
  content_md TEXT NOT NULL,
  content_hash TEXT NOT NULL,       -- hex(sha256(markdown))
  word_count INTEGER,
  first_seen INTEGER NOT NULL,      -- ms epoch
  last_seen INTEGER NOT NULL,       -- ms epoch
  active_ms INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,      -- ms epoch
  updated_at INTEGER NOT NULL       -- ms epoch
);
CREATE INDEX idx_pages_first_seen ON pages(first_seen);
CREATE INDEX idx_pages_domain ON pages(domain);
CREATE INDEX idx_pages_last_seen ON pages(last_seen);

-- Chunks table
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,              -- random uuid or hex(sha256(page_id||idx))
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL                -- chunk markdown with heading prefix
);

-- Full-text search table
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  chunk_id UNINDEXED,
  page_id UNINDEXED,
  tokenize='porter unicode61'
);

-- Vectors table (fallback D1VectorStore)
CREATE TABLE chunk_vectors (
  chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  vector TEXT NOT NULL              -- JSON array of 384 floats
);

-- Migrations in migrations/0001_init.sql
```

## API Message Formats

### Extension → Worker: POST /ingest
```json
{
  "pages": [
    {
      "url": "https://example.com/article",
      "title": "Article Title",
      "domain": "example.com",
      "excerpt": "First 200 chars...",
      "lang": "en",
      "firstSeen": 1699564800000,
      "markdown": "# Article\n\nContent...",
      "contentHash": "abc123...",
      "activeMsDelta": 45000,
      "wordCount": 1500
    }
  ],
  "client": {
    "name": "ghost-extension",
    "version": "1.0.0"
  }
}
```

### Worker → Extension: POST /ingest Response
```json
{
  "ok": true,
  "results": [
    {
      "url": "https://example.com/article",
      "id": "abc123def456",
      "status": "created|merged|updated|skipped",
      "chunks": 3,
      "vector": true
    }
  ]
}
```

### MCP Tool: search_memory
```json
{
  "name": "search_memory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {"type": "string"},
      "from": {"type": "string", "description": "ISO date YYYY-MM-DD"},
      "to": {"type": "string"},
      "domain": {"type": "string"},
      "limit": {"type": "integer", "default": 8}
    },
    "required": ["query"]
  }
}
```

### MCP Tool Response: search_memory
```
**Results for "vector databases" (3 matches)**

1. **How Vector Databases Work** (Score: 0.92)
   - URL: https://example.com/vectors
   - Found: 2 weeks ago, updated 1 week ago
   - Time spent: 12m 34s (754,000 ms)
   - Visits: 3
   - Snippet: "Vector databases store embeddings in high-dimensional space, enabling semantic search. Common implementations include Pinecone, Weaviate, and Milvus..."

[JSON in structuredContent]
```

## Error Handling

- **400 Bad Request**: invalid JSON, missing required fields, invalid URL
- **401 Unauthorized**: bearer token mismatch
- **403 Forbidden**: token valid but lacks permission (not used; all tokens have same access)
- **404 Not Found**: tool name not found in MCP server
- **409 Conflict**: URL already exists (ingest), page ID not found (get_page)
- **503 Service Unavailable**: GHOST_SECRET not set, vector store unreachable, D1 error
- **Never log secrets or page content**; log operation names, result summaries, timestamps

## Security & Privacy Design

- **No central server**: all data in user's Cloudflare account
- **Bearer auth**: timingSafeEqual SHA-256 hash comparison prevents timing attacks
- **Incognito never captured**: double-checked in content script and background
- **Redaction default-on**: emails, cards, secrets, SSN-like patterns masked before sync
- **Blocklist enforcement**: URLs matching blocklist never queued
- **Secret rotation**: user can regenerate GHOST_SECRET in options; old requests fail
- **No analytics**: no tracking pixels, no external requests
- **Encryption at rest**: D1 data encrypted by Cloudflare; user responsible for account security
- **Token scope**: single bearer token grants full read/write access (appropriate for single user)
- **No user-facing tokens**: secret never shown in plain text after initial setup (masked in copy snippets)

## Testing Strategy

1. **Unit tests** (lib/extract, lib/redact, lib/blocklist): fixture HTML, test extraction/redaction/matching
2. **Worker tests** (chunking, URL normalisation, RRF, embedder, auth): pure functions with deterministic inputs
3. **E2E tests**: wrangler dev (local), Playwright headless, real URLs (Wikipedia, MDN, example.com), verify sync, query MCP, forget

## Correctness Properties

- **Idempotency**: syncing the same page twice → same result (merged or updated, no duplicates)
- **URL normalisation**: same URL in different forms → single record
- **Chunk determinism**: same markdown → same chunks (order, content)
- **Embedding determinism** (HashEmbedder): same text → same 384-dim vector (for local dev)
- **No data loss**: embedding errors don't prevent page storage; FTS still works
- **Graceful degradation**: missing Vectorize → D1VectorStore; missing Workers AI → HashEmbedder
- **Privacy by default**: all redaction on, blocklist pre-populated, incognito skipped

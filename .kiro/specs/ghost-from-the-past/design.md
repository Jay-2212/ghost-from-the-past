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

**lib/pipeline.js** (UMD, globalThis.GhostPipeline)
- `runPipeline(doc, url, ctx)` → `{kind, title, markdown, excerpt, lang, meta}` via guard → extractor pick → extract → post-process → return
- Post-processing: dedupe lines, strip boilerplate, collapse whitespace, cap 200k chars, prepend metadata header

**lib/extractors/*** (UMD, registered on globalThis.GhostExtractors)
- Each extractor: `{name, match(url):boolean, extract(doc, url, ctx):{kind,title,markdown,excerpt,lang,meta}}`
- Extractors: youtube, reddit, x, github, wikipedia, stackexchange, product, news, docs, generic
- Selection order: try site extractors first, fallback to generic

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
- `interface VectorStore` → `upsert(items:{id,pageId,values:number[]}[])`, `query(values, topK)` → {id,score}[], `deleteByIds(ids:string[])` (batch delete)
- Fetch chunk_ids from D1 BEFORE page deletion so Vectorize.deleteByIds receives full list (prevent orphan vectors)
- `class VectorizeStore implements VectorStore` → uses env.VECTORS (384-dim cosine index)
- `class D1VectorStore implements VectorStore` → uses D1 chunk_vectors table (brute-force cosine, JSON vectors)

**src/embed.ts**
- `interface Embedder` → `embed(text)` → Float32Array (384 dims); `embedBatch(texts:string[])` → Promise<number[][]> (one AI call per batch, up to 25 texts)
- `class WorkersAiEmbedder implements Embedder` → uses env.AI + @cf/baai/bge-small-en-v1.5; unpacks response.data[0] (shape [1, 384])
- `class HashEmbedder implements Embedder` → deterministic hash, L2-normalised

**src/chunk.ts** (Pure)
- `chunkMarkdown(markdown, title, maxChunks)` → chunk[] with text, heading, index
- Respects headings, blank lines, max size 1200, target 900, overlap 120

**src/search.ts**
- `hybridSearch(query, db, vectorStore, embedder, filters)` → ranked results
- BM25 top 30 + vector top 30 → RRF (k=60) → filter & group → top N

**src/mcp.ts** (MCP SDK)
- Fresh `McpServer` per request with `sessionIdGenerator: undefined` (stateless)
- Use `CfWorkerJsonSchemaValidator` (Workers forbid eval; prevents dynamic Zod schema compilation)
- Tools: `search_memory`, `list_pages`, `get_page`, `forget`, `memory_stats`
- All return text + structuredContent

**src/util.ts**
- `rrf(bm25Results, vectorResults, k)` → fused ranking
- `humanReadableDuration(ms)` → "4m 12s"

## Extraction Pipeline

The extraction pipeline (extension/lib/pipeline.js, with site extractors in extension/lib/extractors/*.js) runs on every page load:

1. **Guard**: reject non-http/https, blocklisted URLs, incognito tabs, login forms (has visible input[type=password] + < 300 words)
2. **Pick extractor**: match URL with site extractors (`youtube`, `reddit`, `x`, `github`, `wikipedia`, `stackexchange`, `product`, `news`, `docs`); else use `generic`
3. **Extract**: call extractor's `extract(doc, url, ctx)` method; if error or result < 120 chars, fallback to `generic`
4. **Post-process** (shared): dedupe lines/paragraphs, strip boilerplate (cookie/consent/subscribe/ads patterns), collapse whitespace, cap 200k chars, prepend metadata header `# {title}\n\n> {kind} · {domain} · {author/channel if any} · {published if any}\n\n`
5. **Return**: `{kind, title, markdown, excerpt, lang, meta: {author, channel, published, price, currency, rating, score, tags}}`

Site extractors (each ≤ ~120 LOC, DOM-first with JSON-LD fallback, no external network except Reddit/YouTube/X API):
| Site | URL Match | Kind | Key Fields | EARS Criteria |
|------|-----------|------|-----------|--------|
| YouTube | youtube.com, youtu.be, m.youtube | youtube-video | title, channel, date, description, [transcript] | transcript via captionTracks[].baseUrl, capped 60k |
| Reddit | reddit.com/r/*/comments/* | reddit-thread | title, author, score, selftext, top 15 comments | fetch .json?limit=40, depth ≤ 2 |
| X | x.com/*/status/*, twitter.com | x-post | author, text, time, replies | article[data-testid="tweet"], ≤ 10 replies |
| GitHub | github.com | github-repo/issue/pr | description, title, state, body, comments | repo: README + stars; PR/issue: body + ≤ 20 comments |
| Wikipedia | *.wikipedia.org/wiki/* | wikipedia-article | title, infobox, body (no refs) | extract minus reference, TOC, navbox |
| Stack Exchange | stackoverflow, *.stackexchange | stackoverflow-question | question, accepted/top answer, top 2 more | body + ≤ 3 answers |
| Product | amazon.*/dp/*, flipkart.com | product | name, price, rating, brand, specs (≤ 40) | JSON-LD Product fallback |
| News | og:type=article, JSON-LD NewsArticle | news-article | headline, author, datePublished, body | Readability fallback |
| Docs | developer.mozilla.org, docs.*, readthedocs | docs-page | main content, code blocks, breadcrumbs | extract main/article/[role=main] |
| Generic | (default) | article | title, excerpt, markdown | Readability + Turndown |

## Onboarding & Connect Handshake

Onboarding flow (extension/onboarding.html/js, 3 screens, automatic on install, or from popup):

```
Install → chrome.runtime.onInstalled
   ↓
Generate secret: crypto.getRandomValues(32) → chrome.storage.local.secret
   ↓
Screen 1: Welcome, "I am!" → next
   ↓
Screen 2: Copy secret, "Deploy to Cloudflare" (opens deploy URL, copies secret to clipboard)
   ↓
User deploys Worker, lands on landing page (GET /)
   ↓
Landing page posts: window.postMessage({source:'ghost-worker', type:'connect'})
   ↓
Content script detects (same-origin, https only) → background.js stores pending offer (url)
   ↓
Background focuses onboarding tab → screen 2.5: "Connect to https://…workers.dev?" + Yes/No
   ↓
User clicks Yes → background saves workerUrl + settings, onboarding proceeds
   ↓
Fallback (if landing page fails): paste Worker URL + secret, "Test connection" button
   ↓
Screen 3: "All done! I'll be watching you", ghost SVG, "Pages: 0", buttons Open Settings / Close
   ↓
Set settings.onboarded = true
```

**Security notes**: 
- Landing page never displays secret (only onboarding tab shows it)
- User must explicitly confirm connection (prevents hostile redirects)
- Pending offer only accepted before onboarding complete, https only

## Default Blocklist

Stored in `chrome.storage.local` (not sync; exceeds 8KB quota). Categories with matching rules:

- **Browser/internal**: `chrome://`, `chrome-extension://`, `edge://`, `moz-extension://`, `about:`, `file://`, `view-source:`; hostnames: `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `*.local`, `*.internal`, `*.lan`, `*.corp`, `*.intranet`; IP ranges: `10.*`, `192.168.*`, `172.16–172.31.*` (matched in code)
- **Auth/login**: `accounts.google.com`, `login.*`, `signin.*`, `auth.*`, `sso.*`, `id.*`, `oauth.*`, `*.okta.com`, `*.auth0.com`; paths: `/login`, `/signin`, `/oauth`, `/authorize`, `/2fa`, `/mfa`, `/otp`, `/password` (regex)
- **Email/messaging**: `mail.google.com`, `outlook.live.com`, `outlook.office.com`, `mail.yahoo.com`, `mail.proton.me`, `web.whatsapp.com`, `discord.com/channels/*`, `app.slack.com`
- **Password managers**: `1password.com`, `bitwarden.com`, `lastpass.com`, `dashlane.com`, `keepersecurity.com`
- **Banking/payments**: hostnames with `*bank*`, `paypal.com`, `stripe.com`, `pay.*`; paths: `/checkout`, `/payment`, `/wallet` (regex)
- **Health**: `mychart.*`, `*patientportal*`, `apollo247.com`, `nhs.uk`
- **Government/ID**: `uidai.gov.in`, `incometax.gov.in`, `passportindia.gov.in`, `irs.gov`, `ssa.gov`
- **Incognito**: never (manifest + runtime, not a pattern)

User can edit blocklist in Options page textarea; "Don't remember this site" popup button adds hostname + shows undo for 5s.

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
  kind TEXT,                        -- youtube-video, reddit-thread, x-post, github-repo, wikipedia-article, etc.
  meta TEXT,                        -- JSON {author, channel, published, price, currency, rating, score, tags}
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

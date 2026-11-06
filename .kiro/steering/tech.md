---
inclusion: always
---

# Ghost from the Past — Technology Stack & Conventions

## Repository Structure

- **extension/**: Chrome MV3 extension, plain JavaScript ES2022, no build step
- **worker/**: Cloudflare Worker, TypeScript, self-contained (own package.json, lockfile, tsconfig)
- **tests/e2e/**: Playwright end-to-end script with headless Chromium + unpacked extension
- **scripts/**: Icon rendering and utility scripts
- **.kiro/**: Steering docs, specs, hooks (never gitignored)

## Extension Stack

### JavaScript Style
- background.js, popup.js, options.js as ES2022 modules; content.js as classic script (MV3 content scripts cannot be modules)
- UMD-compatible pure libs in `lib/` (globalThis.GhostExtract, globalThis.GhostRedact, globalThis.GhostBlocklist)
- Vendor files from npm: `vendor/Readability.js` (@mozilla/readability), `vendor/turndown.js` (turndown) — kept with original licence headers
- No build tool, no bundler; all libs included as separate script tags in manifest (background.js imported as module) or loaded before content script in preload order
- Test runner: `node --test` with jsdom devDependency

### D1 + Vector Storage
- **Primary**: D1 for pages, chunks, full-text search (FTS5 with porter unicode tokenization)
- **Default vectors**: D1VectorStore (vectors stored as JSON in the `chunk_vectors` table, brute-force cosine). Used whenever there is no `VECTORS` binding or `VECTOR_MODE=d1`; the shipped `wrangler.jsonc` has no Vectorize binding, so the Deploy button asks no Vectorize questions
- **Optional**: Vectorize index `ghost-memory` (384 dims, cosine; `wrangler vectorize create ghost-memory --preset @cf/baai/bge-small-en-v1.5`, then add the commented `vectorize` binding) for faster semantic search at large scale
- Graceful degradation: `src/embed.ts` exposes `Embedder` interface with `embedBatch(texts:string[]):Promise<number[][]>` (one AI call per page batch) plus `embed(text)`, with `WorkersAiEmbedder` (via `@cf/baai/bge-small-en-v1.5`, 384 dims) and `HashEmbedder` (deterministic hashed bag-of-words, L2-normalised)
- Vectorize free tier (if enabled): 5M stored dimensions ≈ 13k chunks (max 8 per page)

### Manifest V3
- Service worker (type: module) with `background.js` as entry point
- Content script (classic script, injected at `document_idle` on `<all_urls>`)
- Permissions: `storage`, `alarms`, `unlimitedStorage`, host `<all_urls>`
- Incognito: `"incognito": "not_allowed"` in manifest; double-check `sender.tab.incognito` in background
- No remote code execution; no analytics

## Worker Stack

### TypeScript & Wrangler
- TypeScript 5.x, wrangler 4.x
- `compatibility_date: "2026-11-01"`, `compatibility_flags: ["nodejs_compat"]`
- Two environments: **production** (D1 + Workers AI; D1 vectors unless a Vectorize binding is added) and **local** (`EMBED_MODE=mock`, `VECTOR_MODE=d1`, for dev/e2e)
- Bindings: `DB` (D1, `ghost-memory`), `AI` (Workers AI), `LIMITER` (optional rate limit); `VECTORS` (Vectorize, 384 dims) only if you opt in
- Env vars: `EMBED_MODEL` = `@cf/baai/bge-small-en-v1.5`, `MAX_CHUNKS_PER_PAGE` = `8`, `EMBED_MODE`, `VECTOR_MODE`
- Secret: `GHOST_SECRET` in `.dev.vars` for local dev (never committed). `.dev.vars.example` has it blank (`GHOST_SECRET=`), so the Deploy button shows it as a required field. The Worker treats a missing, short (< 16 chars) or placeholder secret as not configured and returns 503

### MCP SDK
- Official `@modelcontextprotocol/sdk` v1.32+
- Transport: `WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined`, `enableJsonResponse: true`
- Fresh server+transport per request, stateless
- Tools registered with Zod schemas; all return text + structuredContent

### D1 Schema
```sql
pages(id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title, domain, excerpt, lang TEXT,
      content_md TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      word_count INTEGER,
      first_seen, last_seen, active_ms INTEGER,
      visits INTEGER DEFAULT 1,
      created_at, updated_at INTEGER)
chunks(id TEXT PRIMARY KEY,
       page_id TEXT,
       idx INTEGER,
       text TEXT)
chunks_fts(text, chunk_id UNINDEXED, page_id UNINDEXED, tokenize='porter unicode61')
chunk_vectors(chunk_id TEXT PRIMARY KEY,
              page_id TEXT,
              vector TEXT)
```

## Security & Secrets

- **Never log**: secrets, page content, bearer tokens
- **Bearer auth**: `worker/src/auth.ts` hashes the presented token and `GHOST_SECRET` with SHA-256 (`crypto.subtle.digest`), then compares the two 32-byte digests in a constant-time loop (`timingSafeCompare`: XOR every byte pair, OR into an accumulator, equal only if it is 0; no early exit). It does not use `crypto.subtle.timingSafeEqual`
- **gitignore**: `node_modules/`, `.wrangler/`, `.dev.vars`, `shots/*.tmp` — **never** `.kiro/`
- **Secret guard**: `.kiro/hooks/secret-guard.mjs` runs as a `preToolUse` hook in the `ghost` agent (`.kiro/agents/ghost.json`) and blocks writes/commands with secret patterns (GHOST_SECRET=, Bearer tokens, Cloudflare tokens, 40+ char high-entropy strings, .dev.vars writes); on `git commit`/`git push` it also scans `git diff --cached`

## Testing Commands

- Extension: `cd extension && npm test` (runs `node --test test/*.test.mjs`), or `node --test extension/test` from the root (on Node 22 that resolves to `extension/test/index.js`, which imports every `*.test.mjs`)
- Worker: `cd worker && npm run test` (vitest)
- E2E: `node tests/e2e/run.mjs` (Playwright, headless Chromium, local wrangler dev)
- Type-check: `cd worker && npm run typecheck`

## Build & Deploy

- **Icons**: `node scripts/build-icons.mjs` (renders `extension/icons/ghost.svg` to PNG 16/32/48/128)
- **Worker deploy**: `cd worker && npm run deploy` (runs migrations on remote DB, then wrangler deploy)
- **Extension**: loaded unpacked by the user from `extension/` directory
- **Deploy button** (README): https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker

## Conventions

- URL normalization: lowercase host, drop hash, drop utm/tracking params, drop trailing `/` except root
- Markdown: ATX headings, fenced code blocks, `-` bullets (via Turndown)
- Chunking: ~900 chars target, max 1200 chars, 120-char overlap, markdown-aware (on headings/blank paras)
- Date/time: ISO 8601 format (YYYY-MM-DD or ISO datetime), UTC unless `tz_offset_minutes` specified
- Status badge (`setBadge` in `background.js`): empty when connected and haunting, `off` when paused, `!` when not configured (no Worker URL or secret); light text `#F7F5F0` on a `#111111` background
- Active time: only counted when tab is visible AND focused; cap single gaps at 5s (survive sleep)

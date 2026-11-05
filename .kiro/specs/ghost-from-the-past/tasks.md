# Ghost from the Past — Implementation Plan

## Phase 1: Repository Foundation
- [x] 1. Scaffold repository structure
  - [x] 1.1 Create `extension/`, `worker/`, `tests/e2e/`, `scripts/`, `.kiro/specs/` directories
  - [x] 1.2 Create root `package.json` (workspaces NOT allowed; keep extension/ and worker/ independent)
  - [x] 1.3 Create root `.gitignore` (node_modules, .wrangler, .dev.vars, shots/*.tmp; NEVER ignore .kiro)
  - [x] 1.4 Create `LICENSE` (MIT) and `.github/` stubs
  - [x] 1.5 Create `README.md` placeholder and `THIRD_PARTY.md` placeholder

## Phase 2: Worker Foundation
- [x] 2. Set up worker TypeScript project
  - [x] 2.1 Create `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.jsonc` with two environments (production, local)
  - [x] 2.2 Install wrangler 4, TypeScript 5, vitest, @modelcontextprotocol/sdk v1.32+
  - [x] 2.3 Create `worker/.dev.vars.example` with GHOST_SECRET placeholder
  - [x] 2.4 Create `worker/src/util.ts` (pure functions: rRF fusion, humanReadableDuration)
  - [x] 2.5 Create `worker/src/auth.ts` with timingSafeEqual SHA-256 verification
  - [x] 2.6 Create `worker/test/util.test.ts` and `test/auth.test.ts` (vitest)
  - _Requirements: R11, R20.2_

## Phase 3: Worker Storage Layer
- [x] 3. Implement D1 store, chunking, and embeddings
  - [x] 3.1 Create `worker/migrations/0001_init.sql` (pages, chunks, chunks_fts, chunk_vectors schema)
  - [x] 3.2 Create `worker/src/store.ts` (VectorStore interface, VectorizeStore, D1VectorStore)
  - [x] 3.3 Create `worker/src/embed.ts` (Embedder interface, WorkersAiEmbedder, HashEmbedder)
  - [x] 3.4 Create `worker/src/chunk.ts` (markdown-aware chunking: heading splits, blank lines, 900/1200 limits, 120-char overlap)
  - [x] 3.5 Create `worker/test/chunk.test.ts`, `test/embed.test.ts` (determinism, overlap, max chunks)
  - _Requirements: R13, R14, R20.2_

## Phase 4: Worker Ingest & Search
- [x] 4. Implement ingest and hybrid search
  - [x] 4.1 Create `worker/src/ingest.ts` (normaliseUrl, validate, deduplicate, chunk, embed, upsert; handle hash collisions)
  - [x] 4.2 Create `worker/src/search.ts` (FTS BM25, vector query, RRF fusion, filtering by date/domain, grouping)
  - [x] 4.3 Create `worker/test/ingest.test.ts`, `test/search.test.ts` (URL normalisation, idempotency, RRF)
  - [x] 4.4 Create `worker/src/index.ts` route stubs: `/health`, `/ingest`, `/api/stats`
  - _Requirements: R11, R12, R15, R20.2_

## Phase 5: Worker MCP Server
- [x] 5. Implement MCP server
  - [x] 5.1 Create `worker/src/mcp.ts` (McpServer setup, WebStandardStreamableHTTPServerTransport)
  - [x] 5.2 Register tools: `search_memory`, `list_pages`, `get_page`, `forget`, `memory_stats` with Zod schemas
  - [x] 5.3 Implement tool handlers (query, list, get, delete, stats) returning text + structuredContent
  - [x] 5.4 Wire `POST /mcp` route in index.ts; support bearer header and ?token= fallback
  - _Requirements: R17, R18, R19_

## Phase 6: Extension Foundation & Libraries
- [x] 6. Build extension UMD libraries and settings
  - [x] 6.1 Create `extension/package.json` with jsdom, node:test devDependencies
  - [x] 6.2 Create `extension/lib/extract.js` (Readability + Turndown + strip logic, UMD style)
  - [x] 6.3 Create `extension/lib/redact.js` (Luhn, secrets, emails, SSN; UMD style)
  - [x] 6.4 Create `extension/lib/blocklist.js` (glob matching for URLs; UMD style)
  - [x] 6.5 Create `extension/lib/settings.js` (ES module; load/save, defaults)
  - [x] 6.6 Copy `vendor/Readability.js` and `vendor/turndown.js` from npm, keep licence headers
  - [x] 6.7 Create `extension/test/extract.test.mjs`, `test/redact.test.mjs`, `test/blocklist.test.mjs` (node:test)
  - _Requirements: R1, R6, R20.1_

## Phase 7: Extension Content Script & Background
- [x] 7. Implement capture and sync logic
  - [x] 7.1 Create `extension/manifest.json` (MV3, service_worker, content_script, permissions, incognito: "not_allowed")
  - [x] 7.2 Create `extension/content.js` (Readability + Turndown, active time tracking, SPA detection, send ghost:page and ghost:time messages)
  - [x] 7.3 Create `extension/background.js` (Service Worker; queue management, redaction, minDwellMs filtering, chrome.alarms, sync logic)
  - [x] 7.4 Create integration test in `extension/test/` (queue state, message passing)
  - _Requirements: R1–R7, R20.1_

## Phase 8: Extension UI (Popup & Options)
- [x] 8. Implement UI
  - [x] 8.1 Create `extension/popup.html`, `popup.css`, `popup.js` (status, stats, buttons, "Connect Worker" card)
  - [x] 8.2 Create `extension/options.html`, `options.css`, `options.js` (settings, test button, MCP URL copy, recently remembered)
  - [x] 8.3 Follow design-language.md (colors, spacing, shapes, accessibility)
  - _Requirements: R8, R9_

## Phase 9: Icons & Export Script
- [x] 9. Create icon and build script
  - [x] 9.1 Create `extension/icons/ghost.svg` (128×128, bedsheet ghost on squircle, black & off-white)
  - [x] 9.2 Create `scripts/build-icons.mjs` (Playwright chromium screenshot or ImageMagick, render PNG 16/32/48/128)
  - [x] 9.3 Run build-icons.mjs and commit PNG files
  - _Requirements: R10_

## Phase 11: Extraction Pipeline & Site Extractors
- [x] 11. Implement extraction pipeline and site extractors
  - [x] 11.1 Create `extension/lib/pipeline.js` (guard, pick extractor, extract, post-process, return kind+meta)
  - [x] 11.2 Create `extension/lib/extractors/youtube.js`, `reddit.js`, `x.js`, `github.js`, `wikipedia.js`, `stackexchange.js`, `product.js`, `news.js`, `docs.js`, `generic.js` with `match(url)` and `extract(doc, url, ctx)` interface
  - [x] 11.3 Create `extension/test/fixtures/` with sample HTML per extractor (article, Reddit post, X thread, GitHub repo, etc.)
  - [x] 11.4 Create unit tests `extension/test/pipeline.test.mjs`, `extractors.test.mjs` (verify kind, title, markdown output per extractor)
  - _Requirements: R25, R26_

## Phase 12: Onboarding & Worker Landing Page
- [x] 12. Implement onboarding and connect handshake
  - [x] 12.1 Create `extension/onboarding.html`, `onboarding.css`, `onboarding.js` (3 screens: welcome, copy secret + deploy, all done)
  - [x] 12.2 Wire `chrome.runtime.onInstalled` handler to open onboarding tab on install
  - [x] 12.3 Add pending offer logic in `background.js`: detect postMessage from landing page, store offer, focus onboarding tab, prompt user
  - [x] 12.4 Create worker landing page route `GET /` returning HTML with `<meta name="ghost-from-the-past" content="worker">`, "Your ghost is alive", Connect button (postMessage)
  - [x] 12.5 Add to worker routes: OPTIONS preflight (before auth); `GET /` content-negotiation (HTML vs JSON)
  - _Requirements: R23, R27.1, R20.1_

## Phase 13: Privacy Defaults & Don't Remember Popup
- [x] 13. Implement privacy blocklist and per-site forget button
  - [x] 13.1 Update `extension/lib/blocklist.js` DEFAULT_BLOCKLIST with categories (browser/internal, auth, email, payment, health, government, etc.) including private IP ranges in code
  - [x] 13.2 Wire "Don't remember this site" button in `popup.js`: add hostname to blocklist, delete queued entries, show undo for 5s
  - [x] 13.3 Update Options page to display blocklist textarea with "Reset to defaults" button
  - [x] 13.4 Update `lib/settings.js` to store blocklist in `chrome.storage.local` (not sync; quota limit)
  - _Requirements: R24, R6.1_

## Phase 14: Live Extractor Check Tests
- [x] 14. Create live integration tests for extractors
  - [x] 14.1 Create `tests/extractors/live.mjs` (Playwright headless Chromium, inject lib files, run pipeline on real URLs)
  - [x] 14.2 Test one real page per extractor: YouTube video, Reddit thread, X post, GitHub repo, Wikipedia article, StackOverflow question, Amazon product, news article, MDN docs
  - [x] 14.3 Write results to `tests/extractors/out/{name}.md` + summary table (chars, kind, key fields, pass/fail)
  - [x] 14.4 Handle "blocked" status for sites that reject headless/anonymous access
  - _Requirements: R21.3_

## Phase 10: E2E Tests & Documentation
- [x] 10. Test automation and documentation
  - [x] 10.1 Create `tests/e2e/run.mjs` (wrangler dev local, Playwright headless, configure Worker, visit pages, sync, MCP queries, forget, screenshots)
  - [x] 10.2 Create `README.md` (hero, vision, setup, Deploy button, manual install, MCP clients, prompts, Privacy, free limits, Kiro usage, licence)
  - [x] 10.3 Create `.kiro/hooks/test-on-save.mjs` and `.kiro/hooks/secret-guard.mjs` with implementations
  - [x] 10.4 Update `THIRD_PARTY.md` with vendor licences
  - _Requirements: R21.3, R29_

---
*Each task references requirement IDs. Build and test in sequence; each step produces testable, isolated output.*

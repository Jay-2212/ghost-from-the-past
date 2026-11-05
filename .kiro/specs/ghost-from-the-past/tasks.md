# Ghost from the Past — Implementation Plan

## Phase 1: Repository Foundation
- [ ] 1. Scaffold repository structure
  - [ ] 1.1 Create `extension/`, `worker/`, `tests/e2e/`, `scripts/`, `.kiro/specs/` directories
  - [ ] 1.2 Create root `package.json` (workspaces NOT allowed; keep extension/ and worker/ independent)
  - [ ] 1.3 Create root `.gitignore` (node_modules, .wrangler, .dev.vars, shots/*.tmp; NEVER ignore .kiro)
  - [ ] 1.4 Create `LICENSE` (MIT) and `.github/` stubs
  - [ ] 1.5 Create `README.md` placeholder and `THIRD_PARTY.md` placeholder

## Phase 2: Worker Foundation
- [ ] 2. Set up worker TypeScript project
  - [ ] 2.1 Create `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.jsonc` with two environments (production, local)
  - [ ] 2.2 Install wrangler 4, TypeScript 5, vitest, @modelcontextprotocol/sdk v1.32+
  - [ ] 2.3 Create `worker/.dev.vars.example` with GHOST_SECRET placeholder
  - [ ] 2.4 Create `worker/src/util.ts` (pure functions: rRF fusion, humanReadableDuration)
  - [ ] 2.5 Create `worker/src/auth.ts` with timingSafeEqual SHA-256 verification
  - [ ] 2.6 Create `worker/test/util.test.ts` and `test/auth.test.ts` (vitest)
  - _Requirements: R11, R20.2_

## Phase 3: Worker Storage Layer
- [ ] 3. Implement D1 store, chunking, and embeddings
  - [ ] 3.1 Create `worker/migrations/0001_init.sql` (pages, chunks, chunks_fts, chunk_vectors schema)
  - [ ] 3.2 Create `worker/src/store.ts` (VectorStore interface, VectorizeStore, D1VectorStore)
  - [ ] 3.3 Create `worker/src/embed.ts` (Embedder interface, WorkersAiEmbedder, HashEmbedder)
  - [ ] 3.4 Create `worker/src/chunk.ts` (markdown-aware chunking: heading splits, blank lines, 900/1200 limits, 120-char overlap)
  - [ ] 3.5 Create `worker/test/chunk.test.ts`, `test/embed.test.ts` (determinism, overlap, max chunks)
  - _Requirements: R13, R14, R20.2_

## Phase 4: Worker Ingest & Search
- [ ] 4. Implement ingest and hybrid search
  - [ ] 4.1 Create `worker/src/ingest.ts` (normaliseUrl, validate, deduplicate, chunk, embed, upsert; handle hash collisions)
  - [ ] 4.2 Create `worker/src/search.ts` (FTS BM25, vector query, RRF fusion, filtering by date/domain, grouping)
  - [ ] 4.3 Create `worker/test/ingest.test.ts`, `test/search.test.ts` (URL normalisation, idempotency, RRF)
  - [ ] 4.4 Create `worker/src/index.ts` route stubs: `/health`, `/ingest`, `/api/stats`
  - _Requirements: R11, R12, R15, R20.2_

## Phase 5: Worker MCP Server
- [ ] 5. Implement MCP server
  - [ ] 5.1 Create `worker/src/mcp.ts` (McpServer setup, WebStandardStreamableHTTPServerTransport)
  - [ ] 5.2 Register tools: `search_memory`, `list_pages`, `get_page`, `forget`, `memory_stats` with Zod schemas
  - [ ] 5.3 Implement tool handlers (query, list, get, delete, stats) returning text + structuredContent
  - [ ] 5.4 Wire `POST /mcp` route in index.ts; support bearer header and ?token= fallback
  - _Requirements: R17, R18, R19_

## Phase 6: Extension Foundation & Libraries
- [ ] 6. Build extension UMD libraries and settings
  - [ ] 6.1 Create `extension/package.json` with jsdom, node:test devDependencies
  - [ ] 6.2 Create `extension/lib/extract.js` (Readability + Turndown + strip logic, UMD style)
  - [ ] 6.3 Create `extension/lib/redact.js` (Luhn, secrets, emails, SSN; UMD style)
  - [ ] 6.4 Create `extension/lib/blocklist.js` (glob matching for URLs; UMD style)
  - [ ] 6.5 Create `extension/lib/settings.js` (ES module; load/save, defaults)
  - [ ] 6.6 Copy `vendor/Readability.js` and `vendor/turndown.js` from npm, keep licence headers
  - [ ] 6.7 Create `extension/test/extract.test.mjs`, `test/redact.test.mjs`, `test/blocklist.test.mjs` (node:test)
  - _Requirements: R1, R6, R20.1_

## Phase 7: Extension Content Script & Background
- [ ] 7. Implement capture and sync logic
  - [ ] 7.1 Create `extension/manifest.json` (MV3, service_worker, content_script, permissions, incognito: "not_allowed")
  - [ ] 7.2 Create `extension/content.js` (Readability + Turndown, active time tracking, SPA detection, send ghost:page and ghost:time messages)
  - [ ] 7.3 Create `extension/background.js` (Service Worker; queue management, redaction, minDwellMs filtering, chrome.alarms, sync logic)
  - [ ] 7.4 Create integration test in `extension/test/` (queue state, message passing)
  - _Requirements: R1–R7, R20.1_

## Phase 8: Extension UI (Popup & Options)
- [ ] 8. Implement UI
  - [ ] 8.1 Create `extension/popup.html`, `popup.css`, `popup.js` (status, stats, buttons, "Connect Worker" card)
  - [ ] 8.2 Create `extension/options.html`, `options.css`, `options.js` (settings, test button, MCP URL copy, recently remembered)
  - [ ] 8.3 Follow design-language.md (colors, spacing, shapes, accessibility)
  - _Requirements: R8, R9_

## Phase 9: Icons & Export Script
- [ ] 9. Create icon and build script
  - [ ] 9.1 Create `extension/icons/ghost.svg` (128×128, bedsheet ghost on squircle, black & off-white)
  - [ ] 9.2 Create `scripts/build-icons.mjs` (Playwright chromium screenshot or ImageMagick, render PNG 16/32/48/128)
  - [ ] 9.3 Run build-icons.mjs and commit PNG files
  - _Requirements: R10_

## Phase 10: E2E Tests & Documentation
- [ ] 10. Test automation and documentation
  - [ ] 10.1 Create `tests/e2e/run.mjs` (wrangler dev local, Playwright headless, configure Worker, visit pages, sync, MCP queries, forget, screenshots)
  - [ ] 10.2 Create `README.md` (hero, vision, setup, Deploy button, manual install, MCP clients, prompts, Privacy, free limits, Kiro usage, licence)
  - [ ] 10.3 Create `.kiro/hooks/test-on-save.json` and `.kiro/hooks/secret-guard.json` with implementations
  - [ ] 10.4 Update `THIRD_PARTY.md` with vendor licences
  - _Requirements: R20.3, R21, R22_

---
*Each task references requirement IDs. Build and test in sequence; each step produces testable, isolated output.*

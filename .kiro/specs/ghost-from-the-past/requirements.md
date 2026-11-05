# Ghost from the Past — Functional Requirements

## Extension Capture & Content Processing

**R1. Content Capture**
- R1.1: Content script on `<all_urls>` injected at `document_idle`; WHEN a page loads THEN the system SHALL extract main content using Readability library on a cloned document THE SYSTEM SHALL strip nav, header, footer, aside, form, iframe, script, style, noscript, [role=navigation], [role=banner], [aria-modal=true], and elements matching cookie/consent/gdpr/banner/newsletter/subscribe/popup/modal/advert/ads/promo patterns
- R1.2: WHEN extraction completes THEN the system SHALL convert article HTML to Markdown using Turndown with ATX headings, fenced code blocks, and `-` bullets
- R1.3: WHEN Markdown is generated THEN the system SHALL collapse 3+ blank lines, drop empty links/images with `data:` URLs, and cap output at 200,000 characters
- R1.4: WHEN Readability fails or yields < 200 text chars THEN the system SHALL fall back to `document.body.innerText` (cleaned); WHEN cleaned text is < 120 chars THEN the system SHALL skip the page entirely
- R1.5: WHEN content is extracted THEN the system SHALL record: `url` (canonical if same-origin, else `location.href` with hash removed), `title`, `domain` (hostname without `www.`), `firstSeen` (ms epoch), `excerpt` (Readability excerpt or first 200 chars), `lang`, and markdown

**R2. Active Time Tracking**
- R2.1: WHEN tab visibility or focus changes THEN the system SHALL count active time only when `document.visibilityState === 'visible'` AND `document.hasFocus()`
- R2.2: WHEN active time is tracked THEN the system SHALL use visibilitychange, focus, blur listeners plus a 1s ticker; THE SYSTEM SHALL cap any single tick gap at 5s to survive sleep
- R2.3: WHEN active time increments THEN the system SHALL send updates to background every 15s via `{type:'ghost:time', url, deltaMs}` and on `pagehide` event
- R2.4: WHEN URL changes in an SPA THEN the system SHALL detect change by polling `location.href` every 1s and treat as a new page load

**R3. Incognito & Privacy**
- R3.1: WHEN extension context is incognito THEN the system SHALL not capture content; THE SYSTEM SHALL check `chrome.extension.inIncognitoContext` and manifest `"incognito": "not_allowed"`
- R3.2: WHEN capture occurs in background THEN the system SHALL also verify `sender.tab.incognito` and skip if true
- R3.3: WHEN protocol is not http/https THEN the system SHALL not capture

## Extension Queue & Sync

**R4. Capture Queue & Redaction**
- R4.1: WHEN content is captured THEN the system SHALL apply redaction (lib/redact.js) BEFORE enqueueing: card-like numbers (13–19 digits with optional spaces/dashes passing Luhn) → `[redacted-card]`
- R4.2: WHEN redacting THEN secret tokens (`sk-…`, `ghp_…`, `github_pat_…`, `AKIA[0-9A-Z]{16}`, `xox[baprs]-…`, JWT `eyJ…\.…\.…`, PEM blocks) → `[redacted-secret]`
- R4.3: WHEN redacting AND `redactEmails` is on (default true) THEN e-mail addresses → `[redacted-email]`; WHEN US-SSN-like patterns `\b\d{3}-\d{2}-\d{4}\b` THEN → `[redacted-id]`
- R4.4: WHEN new capture of same URL THEN the system SHALL replace markdown/title and keep earliest `firstSeen`; active time deltas add; visited count increments
- R4.5: WHEN total active time < `minDwellMs` (default 5000) THEN the system SHALL keep page in queue but not send; WHEN under-dwell entries are > 24h old THEN drop them

**R5. Sync to Worker**
- R5.1: WHEN `chrome.alarms` fires `ghost-sync` every 5 minutes OR user clicks "Sync now" THEN the system SHALL send batches of ≤ 20 pages to `POST {workerUrl}/ingest` with `Authorization: Bearer {secret}` header
- R5.2: WHEN sync succeeds (2xx) THEN the system SHALL remove sent entries from queue (but keep any time arrived during request); on failure keep them and store `lastError`
- R5.3: WHEN sync completes THEN the system SHALL update stats: `pagesToday` (distinct URLs captured today, local date), `lastSyncAt`, `lastSyncCount`, `lastError`, `totalSynced`

**R6. Settings & Blocklist**
- R6.1: WHEN settings are persisted THEN the system SHALL store in `chrome.storage.sync`: `workerUrl, paused, minDwellMs, redactEmails, blocklist`; `GHOST_SECRET` stored separately in `chrome.storage.local`
- R6.2: WHEN blocklist is evaluated THEN the system SHALL match patterns (glob-ish with `*` wildcard) against hostname and full URL; bare hostname also matches subdomains
- R6.3: WHEN capture URL matches blocklist OR protocol not http/https OR paused OR incognito THEN skip

**R7. Badge & Status**
- R7.1: WHEN haunting THEN badge is empty; WHEN paused THEN badge text "off" (black `#111` background)

## Extension UI

**R8. Popup**
- R8.1: WHEN popup opens THEN the system SHALL display bedsheet ghost mark, "Ghost from the Past" title, large status pill ("Haunting" / "Paused"), stats (pages today, queued, last sync), and buttons Pause/Resume, Sync now, Settings
- R8.2: WHEN not configured THEN show "Connect your Worker" card with link to options page
- R8.3: WHEN user clicks "Sync now" THEN send `{type:'ghost:sync'}` message and display result

**R9. Options Page**
- R9.1: WHEN options page loads THEN the system SHALL display: Worker URL field, Secret password field (with show/hide toggle), "Test connection" button that `GET {workerUrl}/api/stats` with bearer token
- R9.2: WHEN test succeeds THEN display "Connected · {pageCount} pages remembered"
- R9.3: WHEN user clicks "Copy MCP URL" THEN copy `{workerUrl}/mcp` and display JSON snippet for MCP client with Authorization header (masked until reveal)
- R9.4: WHEN options page loads THEN display toggles for `redactEmails`, input for `minDwellSeconds`, textarea for blocklist with "Reset to defaults" button
- R9.5: WHEN user changes settings THEN "Save" button persists to storage
- R9.6: WHEN options page displays THEN show "Recently remembered" list (last 10 queued/synced titles) and "Forget local queue" button

**R10. Icon**
- R10.1: WHEN icon is rendered THEN use SVG `extension/icons/ghost.svg` (128×128 viewBox) with off-white squircle tile and centred bedsheet ghost (black, no mouth or tiny, cute-spooky)
- R10.2: WHEN icons are exported THEN generate PNG 16/32/48/128 via `scripts/build-icons.mjs` maintaining legibility at 16px

## Worker Ingest & Storage

**R11. Worker Authentication**
- R11.1: WHEN request includes Bearer token THEN the system SHALL compare with GHOST_SECRET using `crypto.subtle.timingSafeEqual` on equal-length SHA-256 hashes
- R11.2: WHEN auth fails THEN return 401 JSON; WHEN GHOST_SECRET missing THEN 503 with clear message
- R11.3: WHEN logging THEN never log secret, page content, or bearer tokens

**R12. Ingest & Deduplication**
- R12.1: WHEN `POST /ingest` receives pages (≤ 25, body ≤ 4 MB) THEN validate http/https URL and markdown string; normalise URL (lowercase host, drop hash, `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref_src`, trailing `/` except root)
- R12.2: WHEN new URL THEN insert page, chunk, embed, upsert vectors + FTS; return `{ok:true, results:[{url, id, status:'created', chunks}]}`
- R12.3: WHEN same URL, same hash THEN `last_seen = max`, `first_seen = min`, `active_ms += delta`, `visits += 1`; return status `'merged'`
- R12.4: WHEN same URL, new hash THEN as above PLUS replace content, delete old chunks/FTS/vectors, re-chunk & re-embed; return status `'updated'`
- R12.5: WHEN embedding errors occur THEN store page + FTS chunks without vectors, report `vector:false`

**R13. Chunking**
- R13.1: WHEN page is chunked THEN split on headings and blank-line paragraphs; greedily pack to ~900 char target (max 1200), 120-char overlap
- R13.2: WHEN code fences are encountered THEN never split inside unless block alone > max
- R13.3: WHEN chunks exceed `MAX_CHUNKS_PER_PAGE` (default 8) THEN keep first N chunks only
- R13.4: WHEN chunk is recorded THEN include nearest heading; text sent to embedder is `"{title}\n{heading}\n{chunk}"`

**R14. Embeddings & Vector Storage**
- R14.1: WHEN embedder is initialized THEN use `WorkersAiEmbedder` (via `@cf/baai/bge-small-en-v1.5`, 384 dims) or fallback to `HashEmbedder` (deterministic hashed bag-of-words, L2-normalised)
- R14.2: WHEN vectorizer is initialized THEN use `VectorizeStore` or fallback to `D1VectorStore` (vectors as JSON in `chunk_vectors` table, brute-force cosine)
- R14.3: WHEN `wrangler dev --env local` THEN use `EMBED_MODE=mock` and `VECTOR_MODE=d1` for full local operation

**R15. Search & Ranking**
- R15.1: WHEN search query is received THEN fuse FTS5 `bm25()` top 30 and vector top 30 using Reciprocal Rank Fusion (k=60)
- R15.2: WHEN results are filtered THEN apply `from`/`to` (ISO date/datetime), `domain` (domain or subdomain); group by page keeping best chunk; return top `limit` (default 8, max 25)
- R15.3: WHEN FTS query is escaped THEN quote terms, join with OR

**R16. Health & Stats**
- R16.1: WHEN `GET /` or `/health` THEN return `{ok:true, name:"ghost-from-the-past", version}` and small HTML explaining the service (no data)
- R16.2: WHEN `GET /api/stats` with bearer THEN return `{pages, chunks, lastSeen, vectorMode, embedMode}`

## Worker MCP Server

**R17. MCP Server Setup**
- R17.1: WHEN MCP request arrives THEN create fresh `McpServer` + `WebStandardStreamableHTTPServerTransport` (with `sessionIdGenerator: undefined`, `enableJsonResponse: true`)
- R17.2: WHEN server initializes THEN set name `ghost-from-the-past` and instructions explaining personal reading memory

**R18. MCP Tools**
- R18.1: WHEN `search_memory({query, from?, to?, domain?, limit?})` THEN return ranked results: title, url, snippet (≤ 320 chars), first/last seen (ISO datetime), time spent (human-readable + ms), visits, score; all as text + structuredContent
- R18.2: WHEN `list_pages({date?, from?, to?, domain?, limit?, offset?})` THEN return pages (title, url, domain, first/last seen, time spent) ordered by last_seen desc; `date` = single day `YYYY-MM-DD` (UTC unless `tz_offset_minutes` given); all as text + structuredContent
- R18.3: WHEN `get_page({url?, id?})` THEN return full markdown with header block (title, url, dates, time spent); all as text
- R18.4: WHEN `forget({url?, domain?, from?, to?, confirm})` THEN require at least one selector and `confirm: true`; delete pages, chunks, FTS, vectors; return count; annotate as destructive
- R18.5: WHEN `memory_stats()` THEN return counts, top domains, total time; all as text + structuredContent

## CORS

**R19. CORS Headers**
- R19.1: WHEN `OPTIONS *` THEN respond with headers allowing `Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version`

## Testing

**R20. Test Coverage**
- R20.1: WHEN `node --test extension/test` THEN verify extraction (article survives, nav/footer/ads removed, markdown conversion), redaction (Luhn cards, secrets, emails on/off), blocklist matching
- R20.2: WHEN `cd worker && npm run test` (vitest) THEN verify chunk sizes/overlap/max chunks, URL normalisation, RRF fusion, HashEmbedder determinism/normalisation, auth compare
- R20.3: WHEN `node tests/e2e/run.mjs` THEN launch wrangler dev (local env, apply migrations), Playwright headless, configure Worker + secret, visit 3 real pages, sync, query MCP tools, forget, verify deletion, save screenshots

## Deployment

**R21. Deploy Button**
- R21.1: WHEN Deploy button is clicked THEN link to https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker

**R22. Documentation**
- R22.1: WHEN README is rendered THEN include hero line + icon, what it is, 2-minute setup (Deploy button, set GHOST_SECRET, load extension unpacked, paste URL + secret, test), manual alternative, MCP client setup (Claude, Cursor, Kiro), example prompts, Privacy section, free-tier limits, development & tests, Kiro usage, licence
- R22.2: WHEN THIRD_PARTY.md exists THEN list vendored libraries (@mozilla/readability, turndown) with original licence headers

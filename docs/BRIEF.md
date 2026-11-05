# Ghost from the Past — product & engineering brief

> "A ghost from your past that remembers every page you've read."

Kiroween 2026 entry, **Frankenstein** category (stitches together a browser extension, a
Cloudflare Worker, D1, Vectorize, Workers AI and the Model Context Protocol into one creature).
Author: Jay Bharti (GitHub `Jay-2212`). Licence: MIT.

## 1. What it is

A Chrome (Manifest V3) extension that quietly remembers every web page the user actually reads
and stores it **in the user's own Cloudflare account** (a Worker they deploy with one click).
That Worker is also a **remote MCP server**, so any AI client (Claude, Kiro, Cursor, ChatGPT
connectors, …) can ask "what was that article about vector databases I read last Tuesday?".
Nothing is ever sent to us; there is no central server.

## 2. Repository layout (monorepo, `.kiro/` at the root, never gitignored)

```
/.kiro/steering/{product.md,tech.md,design-language.md}
/.kiro/specs/ghost-from-the-past/{requirements.md,design.md,tasks.md}
/.kiro/hooks/*.kiro.hook
/extension/            MV3 extension, plain JavaScript (ES2022), NO build step
  manifest.json
  background.js        service worker (type: module)
  content.js           content script (classic script; loaded after vendor + lib files)
  lib/extract.js       pure extraction helpers (Readability + Turndown + cleanup), UMD-style:
                       attaches to globalThis.GhostExtract AND works when require()'d from Node
  lib/redact.js        pure redaction helpers (same UMD style, globalThis.GhostRedact)
  lib/blocklist.js     pure URL blocklist matcher (same UMD style, globalThis.GhostBlocklist)
  lib/settings.js      settings defaults + load/save (ES module, used by background/popup/options)
  vendor/Readability.js, vendor/turndown.js  (copied from npm @mozilla/readability, turndown; keep their licence headers; list in /THIRD_PARTY.md)
  popup.html/.css/.js, options.html/.css/.js
  icons/ghost.svg, icons/icon-{16,32,48,128}.png
  test/*.test.mjs      node:test unit tests using jsdom (devDependency at extension/package.json)
/worker/               Cloudflare Worker, TypeScript, fully self-contained (own package.json,
                       lockfile, tsconfig) so the Deploy-to-Cloudflare button can point at it
  wrangler.jsonc
  .dev.vars.example    GHOST_SECRET=...
  migrations/0001_init.sql
  src/index.ts         router
  src/auth.ts  src/ingest.ts  src/chunk.ts  src/search.ts  src/mcp.ts  src/store.ts  src/embed.ts  src/util.ts
  test/*.test.ts       vitest unit tests for pure functions (chunking, URL normalisation, hashing, RRF fusion, auth)
/tests/e2e/            Playwright end-to-end script (headless Chromium + unpacked extension + local wrangler dev + MCP SDK client)
/scripts/build-icons.mjs   renders icons/ghost.svg to the 4 PNG sizes (use playwright-core chromium screenshot or ImageMagick `magick`)
/README.md  /LICENSE (MIT, "Copyright (c) 2026 Jay Bharti")  /THIRD_PARTY.md  /docs/
```

## 3. Extension requirements

### Capture
- Content script on `<all_urls>` at `document_idle`. It first checks: not incognito
  (`chrome.extension.inIncognitoContext`), not paused, URL not blocklisted, protocol is http/https.
- ~1.5 s after idle, extract the main content with **Readability** on a *clone* of the document,
  then convert the article HTML to **Markdown** with **Turndown** (ATX headings, fenced code,
  `-` bullets). Strip before Readability: `nav, header, footer, aside, form, iframe, script,
  style, noscript, [role=navigation], [role=banner], [aria-modal=true]`, and elements whose
  id/class matches cookie/consent/gdpr/banner/newsletter/subscribe/popup/modal/advert/ads/promo.
- Collapse 3+ blank lines, drop empty links/images with data: URLs, cap markdown at 200 000 chars.
- If Readability fails or yields < 200 chars of text, fall back to `document.body.innerText`
  (cleaned) — but skip the page entirely when the text is < 120 chars.
- Record: `url` (canonical if `<link rel=canonical>` is same-origin, else location.href, hash removed),
  `title`, `domain` (hostname without `www.`), `firstSeen` (ms epoch, first time in this page load),
  `markdown`, `excerpt` (Readability excerpt or first 200 chars), `lang`.
- **Active time**: count only time when `document.visibilityState === 'visible'` AND
  `document.hasFocus()`; use visibilitychange/focus/blur listeners plus a 1 s ticker that only adds
  while both are true (cap any single tick gap at 5 s to survive sleep). Send increments to the
  background every 15 s and on `pagehide`.
- SPA support: detect URL changes (poll `location.href` every 1 s) and treat as a new page load.
- Messages to background: `{type:'ghost:page', page}` and `{type:'ghost:time', url, deltaMs}`.

### Queue and sync (background.js)
- Queue lives in `chrome.storage.local` under `queue` as an object keyed by normalised URL:
  `{url,title,domain,firstSeen,lastSeen,markdown,excerpt,activeMsDelta,contentHash?}`. A new
  capture of the same URL replaces markdown/title and keeps the earliest firstSeen; time deltas add.
- Redaction (lib/redact.js) is applied in the background **before enqueueing**: card-like numbers
  (13–19 digits with optional spaces/dashes that pass Luhn) → `[redacted-card]`; common secret
  tokens (`sk-…`, `ghp_…`, `github_pat_…`, `AKIA[0-9A-Z]{16}`, `xox[baprs]-…`, JWT `eyJ…\.…\.…`,
  `-----BEGIN … PRIVATE KEY-----` blocks) → `[redacted-secret]`; e-mail addresses →
  `[redacted-email]` when the setting `redactEmails` is on (default **on**); and US-SSN-like
  `\b\d{3}-\d{2}-\d{4}\b` → `[redacted-id]`.
- Pages with total active time below `minDwellMs` (default 5000) are kept in the queue but not
  sent until they reach it (stale under-dwell entries older than 24 h are dropped).
- `chrome.alarms` alarm `ghost-sync` every 5 minutes, plus "Sync now" from the popup
  (`{type:'ghost:sync'}`, responds with result). Sends batches of ≤ 20 pages to
  `POST {workerUrl}/ingest` with `Authorization: Bearer {secret}`, JSON `{pages:[…], client:{name:'ghost-extension', version}}`.
  On 2xx remove the sent entries (but keep any time that arrived during the request); on failure
  keep them and store `lastError`. Exponential back-off is not required; just retry next alarm.
- Stats in `chrome.storage.local.stats`: `{day:'YYYY-MM-DD', pagesToday, lastSyncAt, lastSyncCount, lastError, totalSynced}`; `pagesToday` counts distinct URLs captured today (local date).
- Badge: empty when haunting, `⏸`-like text "off" when paused (black badge background `#111`).
- Never capture when `tab.incognito` is true (double check in background using `sender.tab.incognito`). Manifest sets `"incognito": "not_allowed"`.

### Settings (lib/settings.js, `chrome.storage.sync` key `settings`, secret in `chrome.storage.local`)
`{ workerUrl:'', paused:false, minDwellMs:5000, redactEmails:true, blocklist:[…defaults] }`, secret
stored separately in `chrome.storage.local.secret` (never in sync storage).
Default blocklist (glob-ish patterns matched against hostname and full URL; `*` wildcard; a bare
hostname pattern also matches subdomains):
`localhost, 127.0.0.1, 0.0.0.0, *.local, chrome://*, chrome-extension://*, edge://*, about:*, file://*,
mail.google.com, outlook.live.com, outlook.office.com, mail.yahoo.com, mail.proton.me, *.bank*, *banking*,
paypal.com, stripe.com, checkout.*, pay.*, *.paytm.com, razorpay.com, accounts.google.com, login.*, signin.*, auth.*,
1password.com, *.1password.com, bitwarden.com, vault.bitwarden.com, lastpass.com, dashlane.com, keepersecurity.com,
web.whatsapp.com, web.telegram.org, discord.com/channels/*`
plus the user's Worker hostname itself (added automatically at runtime).

### UI — see `.kiro/steering/design-language.md`
- **Popup** (320 px wide): bedsheet-ghost mark + "Ghost from the Past"; big status pill
  "Haunting" / "Paused"; "Pages remembered today: N"; "Queued: N"; "Last sync: 3 min ago" (or
  "never" / error text); buttons **Pause / Resume**, **Sync now**, **Settings**. If not configured,
  show a friendly "Connect your Worker" card linking to options.
- **Options page**: Worker URL, Secret (password field with show/hide), **Test connection**
  (GET `{workerUrl}/api/stats` with bearer → shows "Connected · 123 pages remembered"), **Copy MCP URL**
  (copies `{workerUrl}/mcp`) and a snippet box showing the JSON for an MCP client with the
  Authorization header (secret masked until "reveal"), redact-emails toggle, min dwell seconds,
  blocklist textarea (one pattern per line) with "Reset to defaults", Save. Also a small
  "Recently remembered" list (last 10 synced/queued titles from local state) and a "Forget local queue" button.
- Firefox/Edge: Edge works as-is. For Firefox add `browser_specific_settings.gecko.id =
  "ghost-from-the-past@jay-2212"` and `background.scripts: ["background.js"]` alongside
  `service_worker` (Chrome ignores `scripts` when `service_worker` is present). Use the `chrome.*`
  namespace (Firefox supports it).
- Permissions: `storage, alarms, unlimitedStorage, tabs` (tabs only if needed for incognito check; avoid if `sender.tab` suffices), host `<all_urls>`. No remote code, no analytics.

## 4. Worker requirements (worker/)

- TypeScript, wrangler 4, `compatibility_date` "2026-11-01", `compatibility_flags: ["nodejs_compat"]`.
- Bindings: `DB` (D1, database_name `ghost-memory`), `VECTORS` (Vectorize index `ghost-memory`,
  384 dims, cosine), `AI` (Workers AI). Vars: `EMBED_MODEL` = `@cf/baai/bge-small-en-v1.5` (384 dims
  keeps the free tier's 5M stored dimensions ≈ 13k chunks), `MAX_CHUNKS_PER_PAGE` = "8".
  Secret: `GHOST_SECRET` (listed in `.dev.vars.example`, described in package.json `cloudflare.bindings`).
- **Graceful degradation**: `VECTORS` and `AI` are optional at runtime. `src/embed.ts` exposes an
  `Embedder` interface with `WorkersAiEmbedder` and `HashEmbedder` (deterministic hashed
  bag-of-words, 384 dims, L2-normalised; used when `env.AI` is missing or `EMBED_MODE === "mock"`).
  `src/store.ts` exposes a `VectorStore` interface with `VectorizeStore` and `D1VectorStore`
  (vectors stored as JSON in a `chunk_vectors` table, brute-force cosine; used when `env.VECTORS`
  is missing or `VECTOR_MODE === "d1"`). This lets `wrangler dev` run fully locally.
- A `[env.local]`/`env.local` wrangler environment with only D1 and vars
  `EMBED_MODE=mock`, `VECTOR_MODE=d1` for local dev and the e2e test.
- package.json scripts: `dev` (wrangler dev --env local), `test` (vitest run), `typecheck`,
  `db:migrate:local`, `deploy` = `wrangler d1 migrations apply DB --remote && wrangler deploy`.

### D1 schema (migrations/0001_init.sql)
```
pages(id TEXT PRIMARY KEY,           -- first 16 hex of sha256(normalised url)
      url TEXT NOT NULL UNIQUE, title TEXT, domain TEXT, excerpt TEXT, lang TEXT,
      content_md TEXT NOT NULL, content_hash TEXT NOT NULL, word_count INTEGER,
      first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, active_ms INTEGER NOT NULL DEFAULT 0,
      visits INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)
index on (first_seen), (domain), (last_seen)
chunks(id TEXT PRIMARY KEY, page_id TEXT NOT NULL, idx INTEGER NOT NULL, text TEXT NOT NULL)
chunks_fts USING fts5(text, chunk_id UNINDEXED, page_id UNINDEXED, tokenize='porter unicode61')
chunk_vectors(chunk_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, vector TEXT NOT NULL)
```

### Routes
- `GET /` and `GET /health` (no auth): `{ok:true, name:"ghost-from-the-past", version}` (+ a tiny
  HTML page on `/` when `Accept: text/html` explaining what this is, no data).
- `OPTIONS *`: CORS preflight (allow `Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version`).
- `POST /ingest` (bearer): body ≤ 4 MB, ≤ 25 pages. For each page: validate (http/https URL,
  markdown string), normalise URL (lower-case host, drop hash, drop `utm_*`, `fbclid`, `gclid`,
  `mc_cid`, `mc_eid`, `ref_src`; drop trailing `/` except root), `content_hash` = sha256(markdown).
  - New URL → insert page, chunk, embed, upsert vectors + FTS.
  - Same URL, same hash → `last_seen = max`, `first_seen = min`, `active_ms += activeMsDelta`, `visits += 1`.
  - Same URL, new hash → as above **plus** replace content, delete old chunks/FTS/vectors, re-chunk & re-embed.
  - Returns `{ok:true, results:[{url,id,status:'created'|'merged'|'updated'|'skipped', chunks}]}`.
  Embedding errors must not lose the page: store the page + FTS chunks, report `vector:false`.
- `GET /api/stats` (bearer): `{pages, chunks, lastSeen, vectorMode, embedMode}`.
- `ALL /mcp` (bearer, or `?token=` query fallback for clients that cannot set headers — documented
  with a warning): MCP over **Streamable HTTP**, stateless.

### Chunking (src/chunk.ts, pure)
Markdown-aware: split on headings and blank-line paragraphs, greedily pack to ~900 chars target
(max 1200), 120-char overlap between consecutive chunks, never split inside fenced code unless the
block alone exceeds max. Keep at most `MAX_CHUNKS_PER_PAGE` chunks (first ones). Each chunk
records its nearest heading. Text sent to the embedder is `"{title}\n{heading}\n{chunk}"`.

### Search (src/search.ts)
Hybrid: FTS5 `bm25()` top 30 (escape the user query into quoted terms joined with OR) and vector
top 30 (embed query, `VectorStore.query`), fused with **Reciprocal Rank Fusion** (k=60). Then join
pages, filter by `from`/`to` (ISO date or datetime, applied to `last_seen` OR `first_seen` within
range), `domain` (matches domain or subdomain), group by page keeping the best chunk, return top
`limit` (default 8, max 25). Vectorize metadata filters are NOT used (no metadata index needed).

### MCP server (src/mcp.ts)
Use the official `@modelcontextprotocol/sdk` (v1.32+): `McpServer` + `registerTool` with zod
schemas, and `WebStandardStreamableHTTPServerTransport` from
`@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` with
`sessionIdGenerator: undefined` and `enableJsonResponse: true`; create a fresh server+transport per
request and `return transport.handleRequest(request)`. Server name `ghost-from-the-past`.
Server `instructions`: explain it is the user's personal reading memory.
Tools (all return text content — readable markdown — and `structuredContent`):
1. `search_memory({query, from?, to?, domain?, limit?})` → ranked results: title, url, snippet
   (≤ 320 chars around the best chunk), first seen and last seen as ISO datetime, time spent
   human-readable ("4m 12s") and ms, visits, score.
2. `list_pages({date?, from?, to?, domain?, limit?, offset?})` → pages (title, url, domain,
   first/last seen, time spent) ordered by last_seen desc; `date` = a single day `YYYY-MM-DD`
   (interpreted in UTC unless `tz_offset_minutes` is given).
3. `get_page({url? , id?})` → full markdown with a header block (title, url, dates, time spent).
4. `forget({url?, domain?, from?, to?, confirm})` → requires at least one selector and
   `confirm: true`; deletes pages, chunks, FTS rows and vectors; returns count. Annotate as destructive.
5. (nice) `memory_stats()` → counts, top domains, total time.

### Auth (src/auth.ts)
Bearer compare with `crypto.subtle.timingSafeEqual` on equal-length encoded buffers (hash both
sides with SHA-256 first so lengths match). Missing `GHOST_SECRET` → 503 with a clear message.
401 JSON on failure. Never log the secret or page content.

## 5. Icon
`extension/icons/ghost.svg`, 128×128 viewBox: an off-white/white rounded **squircle** tile
(`#FFFFFF` fill, 1.5px-equivalent black outline scaled, superellipse-ish corners ~28% radius),
centred black **bedsheet ghost**: a sheet draped over a head, rounded dome top, slightly flared
sides, wavy/scalloped hem with 3–4 soft folds, two simple oval eye holes (white/negative space),
no mouth or a tiny one, cute-spooky (think "Ghost Choir" bedsheet ghosts). Solid black fill, must
stay legible at 16 px (simplify; thick shapes). Export PNG 16/32/48/128 via scripts/build-icons.mjs.

## 6. Tests
- extension: `node --test extension/test` — extraction on fixture HTML (article survives; nav,
  cookie banner, footer and ads removed; headings/code/links become markdown), redaction (Luhn
  cards redacted, random 16-digit non-Luhn kept, secrets, emails on/off), blocklist matching.
- worker: `vitest run` — chunk sizes/overlap/max chunks/code fences, URL normalisation, RRF fusion,
  HashEmbedder determinism and normalisation, auth compare.
- e2e (`node tests/e2e/run.mjs`): start `wrangler dev --env local --port 8787` (apply local D1
  migrations first, `.dev.vars` with a random GHOST_SECRET generated by the script), launch
  Playwright `chromium.launchPersistentContext` with `--disable-extensions-except` /
  `--load-extension` (headless), open the options page via the service-worker extension id, save
  Worker URL + secret + minDwell 0, visit 3 real pages (e.g. https://en.wikipedia.org/wiki/Ghost,
  https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API, https://example.com), wait for
  capture, trigger sync via the popup "Sync now", then use the MCP SDK `Client` +
  `StreamableHTTPClientTransport` (with `requestInit.headers.Authorization`) to list tools, call
  `search_memory` ("ghost folklore apparition") and expect the Wikipedia URL in the top 3, call
  `list_pages` and `get_page`, then `forget` one URL and confirm it is gone. Save popup/options
  screenshots to `/shots/`. Support env `PROXY_SERVER` for Chromium and `--ignore-certificate-errors`.

## 7. README must contain
Hero line + icon, what it is, how it works (diagram in text), **2-minute setup** (Deploy to
Cloudflare button → `https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker`,
set `GHOST_SECRET` (generate with `openssl rand -hex 32`), load the extension unpacked, paste URL +
secret, Test connection), manual wrangler setup alternative (d1 create, vectorize create
ghost-memory --dimensions=384 --metric=cosine, secret put, migrations apply, deploy), adding the
MCP URL to Claude Code (`claude mcp add --transport http ghost https://…/mcp --header "Authorization: Bearer …"`),
Claude Desktop (via `npx mcp-remote https://…/mcp --header "Authorization: Bearer ${GHOST_SECRET}"`),
Kiro (`.kiro/settings/mcp.json` with `url` + `headers`), Cursor (`~/.cursor/mcp.json` with `url` +
`headers`), example prompts, **Privacy** section (data only in your account, incognito never,
blocklist, redaction, pause, forget tool, delete everything = delete the Worker/D1/Vectorize),
free-tier limits, development & tests, **How we used Kiro** (specs, steering, hooks, CLI sessions,
reviewer loop), licence.

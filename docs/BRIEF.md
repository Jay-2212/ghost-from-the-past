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

---

## 8. Addendum (Jay, 2026-11-05 12:19 IST) — onboarding, privacy defaults, extraction pipeline

### 8.1 Onboarding (extension/onboarding.html/.css/.js)
Opens automatically in a new tab on `chrome.runtime.onInstalled` (reason `install`), also reachable
from the popup when not configured. Same design language, one step per screen, big centred card,
step dots, keyboard accessible.
1. **Welcome** — "Hello and welcome. Hope you're ready to meet your ghost from the past." Button: **I am!**
2. **A few things before we begin** — 2–3 plain sentences: "Your memories live in your own
   Cloudflare account, so nobody else ever holds them. Click Deploy, Cloudflare builds your private
   ghost in about a minute, then come back here." The extension has already generated a random
   secret (32 bytes hex via crypto.getRandomValues, stored in chrome.storage.local.secret) and shows
   it with **Copy secret** ("paste this into the GHOST_SECRET box on the Deploy page"). Button
   **Deploy to Cloudflare** copies the secret to the clipboard and opens
   `https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker`
   in a new tab. Return path, easiest first:
   a) The deployed Worker's landing page (`GET /` HTML) shows "Your ghost is alive" and a
      **Connect to extension** button. The landing page never shows the secret. The extension's
      content script recognises this page by `<meta name="ghost-from-the-past" content="worker">`
      plus `/health` returning name `ghost-from-the-past`; clicking the button posts
      `window.postMessage({source:'ghost-worker', type:'connect'})`; the content script forwards
      `{type:'ghost:connect-offer', workerUrl: location.origin}` to the background, which stores it as
      a *pending* offer (only while onboarding is not complete, only https origins) and focuses the
      onboarding tab. The onboarding tab then shows "Connect to https://…workers.dev?" with
      **Yes, connect** — the user must confirm (prevents a hostile page from redirecting data).
   b) Fallback paste fields: Worker URL (+ secret field prefilled, editable) and **Test connection**.
   Connection test = `GET {url}/api/stats` with the bearer secret → 200 JSON.
3. **All done! I'll be watching you.** — a little ghost (the SVG mark, gentle float animation that
   respects prefers-reduced-motion), "Pages remembered: 0", buttons **Open settings** / **Close**.
   Sets `settings.onboarded = true`.

### 8.2 Privacy defaults (lib/blocklist.js DEFAULT_BLOCKLIST, on from first run, editable in options)
Group patterns with comments in the source; the options page shows the list (one per line) with
"Reset to defaults". Categories:
- Browser/internal & local: chrome://*, chrome-extension://*, edge://*, about:*, moz-extension://*, file://*, view-source:*, localhost, 127.0.0.1, 0.0.0.0, [::1], *.local, *.internal, *.lan, *.corp, *.intranet, 10.*, 192.168.*, 172.16.*–172.31.* (match private IPv4 ranges in code, not as globs).
- Auth/login: accounts.google.com, login.*, signin.*, sign-in.*, auth.*, sso.*, id.*, idp.*, oauth.*, *.okta.com, *.auth0.com, login.microsoftonline.com, appleid.apple.com, and any URL path matching /(login|signin|sign-in|logon|oauth|authorize|sso|2fa|mfa|otp|password|reset-password)\b.
- Email & messaging: mail.google.com, inbox.google.com, outlook.live.com, outlook.office.com, outlook.office365.com, mail.yahoo.com, mail.proton.me, *.protonmail.com, mail.zoho.com, *.fastmail.com, icloud.com/mail, web.whatsapp.com, web.telegram.org, messages.google.com, discord.com/channels/*, app.slack.com.
- Password managers: 1password.com, *.1password.com, bitwarden.com, vault.bitwarden.com, lastpass.com, dashlane.com, keepersecurity.com, nordpass.com, proton.me/pass, passwords.google.com.
- Banking, UPI & payments: *bank*.* hostnames (e.g. hdfcbank.com, onlinesbi.sbi, icicibank.com, axisbank.com, kotak.com, chase.com, bankofamerica.com, wellsfargo.com, barclays.*, hsbc.*), *netbanking*, paypal.com, stripe.com, checkout.*, pay.*, payments.*, pay.google.com, paytm.com, *.paytm.com, phonepe.com, bhimupi.org.in, npci.org.in, razorpay.com, *.razorpay.com, cred.club, wise.com, revolut.com, venmo.com, cash.app, zerodha.com/kite (kite.zerodha.com), groww.in, robinhood.com, coinbase.com, binance.com, any path containing /checkout, /payment, /billing, /wallet.
- Health portals: mychart.*, *.mychart.com, *patientportal*, *.practo.com/consult, healthvault.*, myhealth.*, patient.*, apollo247.com, 1mg.com/my-account, nhs.uk/nhs-app, *.healthcare.gov.
- Government & ID: uidai.gov.in, myaadhaar.uidai.gov.in, incometax.gov.in, eportal.incometax.gov.in, digilocker.gov.in, passportindia.gov.in, epfindia.gov.in, irs.gov, ssa.gov, login.gov, id.me, gov.uk/sign-in, *.gc.ca/signin, my.gov.au.
- Incognito: never (manifest `"incognito": "not_allowed"` + runtime checks) — documented in the list header, not a pattern.
Popup gets a one-click **Don't remember this site** button: adds the current tab's hostname to the
blocklist, deletes any queued entries for that host, and shows "Forgotten locally. Use the forget
tool to remove it from your ghost too." (plus an Undo for 5 s).

### 8.3 Extraction pipeline (extension/lib/pipeline.js + extension/lib/extractors/*.js)
All classic/UMD files registered on `globalThis.GhostExtractors` so content.js and node tests share
them. Pipeline: `runPipeline(doc, url, {now}) → {kind, title, markdown, excerpt, lang, meta}`:
1. **Guard**: protocol http/https, not blocklisted, not incognito, document not a login form page
   (has `input[type=password]` visible and < 300 words → skip).
2. **Pick extractor**: first site extractor whose `match(url)` is true; else `generic`.
3. **Extract** with the site extractor; if it throws or returns < 120 chars, fall back to `generic`.
4. **Post-process** (shared): strip boilerplate lines (cookie/consent/"sign in"/"subscribe"/"share
   this"/"advertisement"/"skip to content"/"accept all"), collapse whitespace, **dedupe** repeated
   lines/paragraphs (exact and whitespace-normalised, keep first), remove empty links/data: images,
   enforce caps (whole doc 200 000 chars; comments/answers sections capped per extractor), prepend a
   metadata header:
   `# {title}\n\n> {kind} · {domain} · {author/channel if any} · {published if any}\n\n`.
5. **Return** with `kind` (e.g. `youtube-video`, `reddit-thread`, `x-post`, `github-repo`,
   `github-issue`, `github-pr`, `wikipedia-article`, `stackoverflow-question`, `product`,
   `news-article`, `docs-page`, `article`) and `meta` (small JSON: author, channel, published,
   price, currency, rating, score, tags — only fields found).
Time on page stays in content.js (visible+focused), independent of the extractor.

Extractors (each ≤ ~120 lines, DOM-first with JSON-LD / embedded JSON fallbacks, never network
except where noted):
- `youtube` (youtube.com/watch, youtu.be, m.youtube.com/watch, youtube.com/shorts): title, channel,
  publish date, description from `ytInitialPlayerResponse.videoDetails` (parse from inline
  `<script>` text with a brace-matching JSON slice) or DOM (`#title h1`, `ytd-channel-name a`,
  `#description-inline-expander`); **transcript when available**: captionTracks[].baseUrl (prefer
  manual English, else ASR English, else first) fetched same-origin with `&fmt=json3`, flattened to
  paragraphs every ~30 s with `[mm:ss]` stamps, capped 60 000 chars; failure → description only.
- `reddit` (reddit.com/r/*/comments/*, old.reddit.com): fetch same-origin `{url-without-query}.json?limit=40&sort=top`
  → post title, author, subreddit, score, selftext (or link URL) + top 15 comments (author, score,
  body, depth ≤ 2, skip deleted/AutoModerator); DOM fallback (`shreddit-post`, `shreddit-comment`).
- `x` (x.com/*/status/*, twitter.com/*/status/*): `article[data-testid="tweet"]` → author name +
  handle, `[data-testid="tweetText"]`, time datetime; first article = main post, next ≤ 10 = thread
  /replies; images as alt text.
- `github` (github.com): repo root → description, topics, stars (from `#repo-stars-counter-star` or
  aria), README `article.markdown-body`; issues/PRs (`/issues/N`, `/pull/N`) → title, state, author,
  body + comments (`.comment-body`, `[data-testid="markdown-body"]`, `.markdown-body`), cap 20
  comments; other GitHub pages → generic.
- `wikipedia` (*.wikipedia.org/wiki/*): `#mw-content-text .mw-parser-output` minus `.reference`,
  `sup.reference`, `.mw-editsection`, `.navbox`, `.metadata`, `#toc`, `.hatnote`, `.reflist`,
  "References/External links/See also" sections onward; infobox → key: value list at top.
- `stackexchange` (stackoverflow.com/questions/*, *.stackexchange.com/questions/*, superuser.com,
  serverfault.com, askubuntu.com): question title, tags, score, body (`.question .s-prose`), accepted
  answer (`.answer.accepted-answer`) else top-voted, plus next 2 answers by score, with scores.
- `product` (amazon.*/dp/*, amazon.*/gp/product/*, flipkart.com/*/p/*, and any page with JSON-LD
  `@type: Product`): name (`#productTitle` / JSON-LD / `h1`), price + currency (`.a-price .a-offscreen`,
  `#corePriceDisplay_desktop_feature_div`, JSON-LD offers, Flipkart price node with ₹), rating,
  brand, key specs (`#feature-bullets li`, `#productDetails_techSpec_section_1 tr`,
  `#productOverview_feature_div tr`, Flipkart spec tables `table tr`), capped 40 spec rows; no reviews.
- `news` (pages whose JSON-LD `@type` is NewsArticle/Article/BlogPosting/ReportageNewsArticle, or
  `og:type=article`): headline, author(s), datePublished, section; body via Readability.
- `docs` (developer.mozilla.org, docs.*, *.readthedocs.io, learn.microsoft.com, developers.cloudflare.com,
  docs.github.com, nodejs.org/api, python.org/3/library, kiro.dev/docs, any page with
  `<main>` + a sidebar nav and many `<pre>`): main/article/[role=main] content, keep code blocks with
  language, breadcrumbs → meta.section, drop sidebars/TOC/"Was this helpful".
- `generic`: the Readability + Turndown path from §3.
Tests: unit tests with small synthetic HTML fixtures per extractor (`extension/test/fixtures/*.html`)
and a live check `node tests/extractors/live.mjs` that opens one real page per extractor in headless
Chromium, injects the lib files, runs the pipeline and writes `tests/extractors/out/{name}.md` +
a summary table (chars, kind, key fields found, pass/fail). Sites that block headless/anonymous
access (often X, sometimes Reddit/YouTube/Amazon) are reported as "blocked", not faked.

### 8.4 Worker changes
- `pages` gets `kind TEXT` and `meta TEXT` (JSON) columns; ingest accepts `kind`/`meta`; MCP results
  include `kind`; `list_pages`/`search_memory` accept optional `kind` filter.
- `GET /` HTML landing page: "Your ghost is alive" + `<meta name="ghost-from-the-past" content="worker">`
  + **Connect to extension** button (postMessage, see 8.1) + MCP URL (`{origin}/mcp`) and how to add it;
  never shows the secret or any memory.

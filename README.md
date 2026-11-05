# Ghost from the Past

![Ghost icon](extension/icons/icon-128.png)

**A ghost from your past that remembers every page you've read.**

A personal, privacy-first browser memory for knowledge workers, researchers, and curious readers. Ghost quietly captures and makes searchable every web article you read, storing it in your own Cloudflare account. No central server. No tracking. No data leaves your infrastructure.

---

## What It Does

The ghost remembers every page you read:

- **Clean markdown** of the article, extracted with site-specific extractors (YouTube, Reddit, X, GitHub, Wikipedia, Stack Exchange, product pages, docs, news).
- **URL and title**, captured when you visit.
- **Time on page**: how long you actually spent reading (only while visible and focused, capped at 5s gaps to survive screen-lock).
- **Date and visit count**: first seen, last seen, number of times you've read it.

All stored in your own Cloudflare Worker, with full-text search (D1 FTS5) and optional semantic search (Vectorize or D1 vector fallback with Workers AI embeddings).

Searchable by any AI assistant that supports MCP — Claude Desktop, Claude Code, Kiro CLI, or any MCP client.

---

## How It Works

```
┌─────────────────────────┐
│   Browser Extension     │
│  (Chrome MV3, ES2022)   │
│  • Captures pages       │
│  • Extracts markdown    │
│  • Local queue          │
└───────────┬─────────────┘
            │
            │ HTTPS + Bearer auth
            ▼
┌─────────────────────────┐
│  Your Cloudflare Worker │
│  • D1 database          │
│  • Vectorize index      │
│    (or D1 vector store) │
│  • Workers AI embed     │
│  • MCP server at /mcp   │
└───────────┬─────────────┘
            │
            │ MCP over HTTP
            ▼
┌─────────────────────────┐
│  Claude / Kiro / any    │
│  MCP-compatible client  │
│  Authorization: Bearer  │
└─────────────────────────┘
```

### MCP Tools

- **`search_memory`**: semantic + keyword search with filters (date range, domain, page kind), returns ranked results with snippets, URLs, titles, reading time.
- **`list_pages`**: list pages by date/domain/kind, newest first.
- **`get_page`**: full markdown by URL or ID.
- **`forget`**: delete pages by URL, domain, or date range (requires `confirm: true`).
- **`memory_stats`**: page count, chunk count, total reading time, top domains and kinds.

---

## Privacy

Ghost is built privacy-first:

- **No central server.** Everything runs in your Cloudflare Workers account. We never see your data.
- **Incognito is never captured.** Private browsing stays private. The extension refuses to run in incognito mode.
- **Secret never leaves your machine/Worker.** Your `GHOST_SECRET` is generated in the browser, pasted into your Worker, and used only for authentication. No third-party ever sees it.
- **Default blocklisting**: sites that should never be captured are blocked by default:
  - **Browser pages and private network**: chrome://, localhost, private IPs, single-label intranet names.
  - **Sign-in/accounts/one-time codes**: login pages, OAuth flows, password resets, account settings, auth paths.
  - **Email and private messages**: webmail, WhatsApp, Telegram, Discord, Slack, Teams, Messenger, DMs.
  - **Password managers**: 1Password, Bitwarden, LastPass, Dashlane, etc.
  - **Banking/UPI/payments/investing/crypto**: banks, payment processors, UPI apps, checkout/payment paths, trading platforms, exchanges.
  - **Health portals**: patient portals, telemedicine sites, health records.
  - **Government/tax/ID**: UIDAI, income tax, DigiLocker, passport, PF, GST, IRS, SSA, etc.
  
  The blocklist is editable in Options with **"Reset to defaults"** to restore it.
- **"Don't remember this site"**: a button in the toolbar popup blocks the current domain forever (shows "Won't remember \<site\>" with Undo for 5 seconds).
- **Redaction by default**: card numbers, API keys/tokens/private keys, SSN-like and Aadhaar-like IDs are stripped from captured content before upload. Email addresses are hidden by default and switchable in Options.
- **You can forget.** The `forget` tool in MCP can delete pages, entire domains, or date ranges.
- **You can delete everything.** Delete the Worker, the D1 database, and the Vectorize index. The ghost vanishes.

---

## 10-Minute Setup

### 1. Load the Extension

1. Clone this repo: `git clone https://github.com/Jay-2212/ghost-from-the-past.git`
2. Open Chrome (or any Chromium browser) and go to `chrome://extensions/`
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension/` directory.

The extension will open an onboarding tab.

![Onboarding: Welcome](shots/onboarding-1-welcome.png)

### 2. Deploy Your Worker

You have two options:

#### Option A: Deploy to Cloudflare Button

Click the button below to deploy to your Cloudflare account:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker)

Follow the wizard to create the D1 database (`ghost-memory`), Vectorize index (`ghost-memory`, 384 dimensions, cosine distance), and deploy the Worker.

After deploying, set the secret:

```bash
npx wrangler secret put GHOST_SECRET --name ghost-from-the-past
```

Paste the secret from the onboarding screen (or copy it from the extension's options page).

#### Option B: Manual Deploy

```bash
cd worker
npm install
npx wrangler d1 create ghost-memory
npx wrangler vectorize create ghost-memory --dimensions 384 --metric cosine
# Update wrangler.jsonc with the database_id and binding name
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
npx wrangler secret put GHOST_SECRET
```

Paste the secret from the onboarding screen.

![Onboarding: Cloudflare deploy](shots/onboarding-2-cloudflare.png)

### 3. Connect the Extension to Your Worker

1. Visit your Worker URL (e.g., `https://ghost-from-the-past.YOUR_SUBDOMAIN.workers.dev/`).
2. The landing page will hand the Worker URL to the extension.
3. The extension will show a confirmation screen. Click **Yes, connect to this Worker**.

![Onboarding: Confirm Worker](shots/onboarding-2b-confirm.png)

4. The extension tests the connection and shows **"All done! I'll be watching you."**

![Onboarding: Done](shots/onboarding-3-done.png)

---

## Connect Claude Desktop / Claude Code / Kiro

Add this to your MCP config:

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ghost-from-the-past": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://ghost-from-the-past.YOUR_SUBDOMAIN.workers.dev/mcp",
        "--header",
        "Authorization: Bearer ${GHOST_SECRET}"
      ],
      "env": {
        "GHOST_SECRET": "YOUR_SECRET_HERE"
      }
    }
  }
}
```

Restart Claude Desktop.

### Claude Code

```bash
claude mcp add --transport http ghost https://ghost-from-the-past.YOUR_SUBDOMAIN.workers.dev/mcp --header "Authorization: Bearer YOUR_SECRET_HERE"
```

### Kiro CLI

Edit `~/.kiro/settings/mcp.json` (or `.kiro/settings/mcp.json` in a workspace):

```json
{
  "mcpServers": {
    "ghost-from-the-past": {
      "url": "https://ghost-from-the-past.YOUR_SUBDOMAIN.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SECRET_HERE"
      }
    }
  }
}
```

### Fallback: Token in Query String

If your MCP client doesn't support custom headers, append `?token=YOUR_SECRET` to the URL:

```json
{
  "mcpServers": {
    "ghost-from-the-past": {
      "url": "https://ghost-from-the-past.YOUR_SUBDOMAIN.workers.dev/mcp?token=YOUR_SECRET"
    }
  }
}
```

(Less secure; prefer the `Authorization` header if supported.)

---

## Example Prompts

Once connected, try asking your AI assistant:

- **"What did I read about vector databases last week?"**
- **"Find that article about Rust async I read on November 3rd."**
- **"List everything I read on GitHub yesterday."**
- **"Show me the full text of the Wikipedia article about ghosts I read."**
- **"How much time have I spent reading developer.mozilla.org?"**
- **"Forget all pages from example.com."**

The AI will use the MCP tools to search your reading memory and answer with citations.

![MCP search result (rendered as cards by a script from shots/mcp-search-results.json)](shots/search-result.png)

*Real `search_memory` response from the deployed test Worker, rendered as cards by a Hark script.*

---

## Free Tier Limits

Ghost is designed to fit within Cloudflare's free tier for personal use:

- **D1**: generous storage and read/write quotas. A typical page is 1 row + 4-8 chunk rows.
- **Vectorize**: free tier supports thousands of pages (384-dim embeddings, max 8 chunks per page).
- **Workers AI**: free Neurons/day for embedding calls. One page = ~1 batch call for 4-8 chunks.
- **Workers requests**: free tier supports typical personal browsing. The extension batches uploads; sync runs every 5 minutes or on-demand.

Check [Cloudflare's current free tier limits](https://developers.cloudflare.com/workers/platform/pricing/) for exact numbers.

The Worker uses D1VectorStore (vectors stored as JSON, brute-force cosine search) when `VECTOR_MODE=d1` or when no `VECTORS` binding is present. Slower than Vectorize, but still works.

---

## Screenshots

### Popup

![Popup before sync](shots/popup-before-sync.png)

*Before syncing: local queue shown.*

![Popup after sync](shots/popup.png)

*After syncing: last sync time and page count.*

![Popup: Don't remember this site](shots/popup-forget-site.png)

*Popup button shows "Won't remember \<site\>" with Undo for 5 seconds.*

### Options

![Options page](shots/options.png)

*Settings: Worker URL + secret, Test connection, MCP URL/config copy, pause, hide emails, minimum time on page, blocklist + Reset to defaults, recently remembered, Sync now, Forget local queue, Run setup again.*

### Worker Landing

![Worker landing page](shots/worker-landing.png)

*Your Worker's home page: hands the URL to the extension, shows connection status.*

---

## Testing

Ghost has three test suites:

### Worker Tests (Vitest)

```bash
cd worker
npm test
```

Tests covering authentication, chunking, embeddings, search, and utility functions (auth.test.ts, chunk.test.ts, embed.test.ts, search.test.ts, util.test.ts).

### Extension Tests (Node.js `node:test`)

```bash
cd extension
npm test
```

27 tests covering extraction pipeline, privacy/blocklist/redaction, and blocklist-undo. Uses jsdom for DOM mocking.

### End-to-End Tests (Playwright)

```bash
node tests/e2e/run.mjs
```

21 tests locally (19 against a deployed Worker):
- Extension service worker loads.
- Onboarding opens on install.
- Secret generated.
- Worker starts (wrangler dev, local D1).
- Landing page hands URL to extension.
- Connection test passes.
- Pages captured into local queue.
- Blocklisted page (accounts.google.com) not captured.
- Popup "Sync now" sends the queue.
- 4 pages, 26 chunks, 4 kinds in D1.
- MCP lists 5 tools.
- `search_memory` finds the Wikipedia ghost article.
- `search_memory` with domain filter finds MDN.
- `list_pages` for today returns 4 pages.
- `get_page` returns 94,725 chars of markdown.
- `forget` refuses without confirm.
- `forget` deletes a page.
- Forgotten page is gone.
- MCP without the secret is rejected (401).

Test results in `shots/e2e-results.json`.

### Live Extractor Check

```bash
node tests/extractors/live.mjs
```

Tests the extraction pipeline on 10 real URLs (4 pass, 4 blocked by sites, 2 extractor gaps: GitHub repo meta.description missing, news kind on a section page).

---

## How Kiro Built This

Ghost was built as a **spec-driven development** experiment for Kiroween 2026, combining autonomous AI coding (Kiro) with an AI agent fallback (Hark, invoked when Kiro credits were exhausted).

### Spec-Driven Development

The project started with an 8-section **Brief** ([`docs/BRIEF.md`](docs/BRIEF.md)), written by Hark from the product owner's requirements, then expanded by Kiro into three formal specs:

1. **Requirements** ([`.kiro/specs/ghost-from-the-past/requirements.md`](.kiro/specs/ghost-from-the-past/requirements.md)): must-have + should-have features, constraints, success criteria.
2. **Design** ([`.kiro/specs/ghost-from-the-past/design.md`](.kiro/specs/ghost-from-the-past/design.md)): architecture, data model, API contracts, security model, error handling.
3. **Tasks** ([`.kiro/specs/ghost-from-the-past/tasks.md`](.kiro/specs/ghost-from-the-past/tasks.md)): ordered checklist of 14 implementation tasks, ticked off as completed.

These specs were never stale: Kiro updated them as new requirements emerged (e.g., onboarding flow, privacy defaults, site-specific extractors).

### Steering Files

Three steering files provided ongoing context:

- **[`product.md`](.kiro/steering/product.md)**: vision, users, privacy promise, non-goals, market positioning.
- **[`tech.md`](.kiro/steering/tech.md)**: stack, conventions, testing commands, build/deploy steps (this file was always injected into Kiro's context).
- **[`design-language.md`](.kiro/steering/design-language.md)**: UI palette, typography, layout patterns (for screenshots and HTML templates).

### Hooks

Two Kiro agent hooks in [`.kiro/hooks/`](.kiro/hooks/):

- **`secret-guard`**: PreToolUse hook for `shell` and `write` tool calls; runs `node .kiro/hooks/secret-guard.mjs` to scan for secret patterns before committing or writing files.
- **`test-on-save`**: PostFileSave hook that runs worker vitest on save of `.ts` files in `worker/src/`, and extension node:test on save of `.js` files in `extension/lib/`.

### Vibe Coding vs Spec Coding

- **Spec coding** (Kiro S1, S2, S4): Kiro wrote or updated the specs first, then implemented from the specs. High structure, clear success criteria, easy to parallelize (e.g., Hark took over the worker implementation in S4 after Kiro had written the updated specs).
- **Vibe coding** (Kiro S5, S6, S7): Kiro was given task-scoped prompts and implemented directly against the existing specs. Faster iteration for fixes, review, tests, and documentation.

Both approaches worked. Spec coding was better for new, unfamiliar subsystems (MCP server, D1 schema, extraction pipeline). Vibe coding was better for iteration and bug-fixing (e2e test flakiness, popup UI polish).

### Authorship Table

Based on `git log --oneline` and session logs in [`docs/kiro-logs/`](docs/kiro-logs/):

| Commit(s) | Author | What | Session |
|-----------|--------|------|---------|
| `d18715a` | **Kiro** | Steering files, specs (requirements/design/tasks), hooks (secret-guard, test-on-save), worker scaffold (auth, chunk, embed, store, util + 15 util tests), wrangler config | S1, S2 |
| `a52afca` (specs only) | **Kiro** | Spec updates: requirements/design/tasks for onboarding, privacy defaults, extraction pipeline | S4 |
| `a52afca` (worker code), `3feb307`, `4b4bcfe`, `b42026f`, `26ddc2c`, `f81f288`, `5df70a7`, `d98918a` | **Hark** | Worker (index, ingest, search, MCP, landing, env, chunk/store changes), extension (manifest, content script, background sync, popup, options, onboarding, blocklist, redaction, extractors, unit tests), e2e tests, screenshots | (Kiro credits exhausted after S4) |
| `3f0747d`, `950bda6`, `5761c47` | **Hark** | Worker tests pass (37), typecheck clean, extension unit tests (27) | (no Kiro session log) |
| `36ed733` | **Kiro** | E2e sync-wait race fixed, popup "Last sync" from `ghost:status`, review of Hark-written code, S5b follow-up fix | S5, S5b |
| `8829ca3` | **Kiro** | Popup forget-site undo test + toast styling, live extractor check (`tests/extractors/live.mjs`), S6b fix (4 pass, 4 blocked by sites, 2 extractor gaps), tasks.md ticked | S6, S6b |
| `afa565b` | **Hark** | Screenshots: real `search_memory` result from deployed test Worker (rendered as cards), popup "Don't remember this site" toast | (after S6) |
| `895d1c4` | **Hark** | S7 prompt: authorship facts for README table | (before S7) |
| (this commit) | **Kiro** | README, THIRD_PARTY.md | S7 |

**Product owner (Jay)**: idea, name and requirements. `docs/BRIEF.md` was written down by Hark from those requirements.

Most application code was written by Hark (an AI agent) while Kiro credits were exhausted; Kiro wrote the steering, specs, hooks and scaffold, and from S5 on reviewed and changed the code.

### Known Gaps

Honest list of what's incomplete or not tested:

- **Live extractor check**: 4 pass, 4 blocked by sites, 2 extractor gaps (GitHub repo `meta.description` not extracted, news `kind` wrongly set on a section page).
- **Vectorize path not exercised**: the deployed test Worker uses D1VectorStore (`VECTOR_MODE=d1`), not Vectorize, because the Cloudflare API token used for testing has no Vectorize permission. Vectorize code is written but not e2e-tested.
- **Not on Chrome Web Store**: users must load the extension unpacked. This is by design (no Google review process, users can audit the code), but it's a barrier to adoption.

---

## Logs & Prompts

Full Kiro session logs and prompts are in [`docs/kiro-logs/`](docs/kiro-logs/):

- **[s1.log](docs/kiro-logs/s1.log)**, **[s1-prompt.md](docs/kiro-logs/s1-prompt.md)**: steering files, specs, hooks.
- **[s2.log](docs/kiro-logs/s2.log)**, **[s2-prompt.md](docs/kiro-logs/s2-prompt.md)**: worker scaffold.
- **[s4.log](docs/kiro-logs/s4.log)**, **[s4-prompt.md](docs/kiro-logs/s4-prompt.md)**: spec updates for onboarding, privacy, extractors.
- **[s5.log](docs/kiro-logs/s5.log)**, **[s5-prompt.md](docs/kiro-logs/s5-prompt.md)**, **[s5b.log](docs/kiro-logs/s5b.log)**, **[s5b-prompt.md](docs/kiro-logs/s5b-prompt.md)**: e2e sync-wait race fixed, popup improvements.
- **[s6.log](docs/kiro-logs/s6.log)**, **[s6-prompt.md](docs/kiro-logs/s6-prompt.md)**, **[s6b.log](docs/kiro-logs/s6b.log)**, **[s6b-prompt.md](docs/kiro-logs/s6b-prompt.md)**: popup forget-site, live extractor check.
- **[s7-prompt.md](docs/kiro-logs/s7-prompt.md)**, **[s7.log](docs/kiro-logs/s7.log)**: this README.

---

## License

MIT. See [LICENSE](LICENSE).

Third-party dependencies: see [THIRD_PARTY.md](THIRD_PARTY.md).

---

## Contributing

Ghost is a Kiroween 2026 project. We're not accepting external contributions at this time, but you're welcome to fork it and run your own ghost. 👻

If you find a bug or have a feature request, open an issue.

---

**Built with Kiro CLI + Hark, for Kiroween 2026.**

Kiro S10: make the worker/ directory deploy cleanly through the "Deploy to Cloudflare" button (https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker) for a brand-new user on a FREE Cloudflare account, with no CLI steps. Hark researched the button's behaviour (Cloudflare docs https://developers.cloudflare.com/workers/platform/deploy-buttons/ and workers-sdk issue cloudflare/developer-platform#28); implement ONLY the items below. Rules: never print, log or commit any secret; do not read /workspace/work/.ghost-test-secret; no git, no deploy, no network calls to Cloudflare. Keep edits small and in the existing style (worker is TypeScript; extension libs are UMD/classic JS; onboarding/options are ES modules).

## Facts about the Deploy button (for context)
- The button clones ONLY the worker/ subdirectory into a new repo in the user's GitHub, then builds with Workers Builds. worker/ must be self-contained (it is: own package.json + package-lock.json).
- Secrets come from worker/.dev.vars.example. Every line becomes a field on the Deploy page. A blank value (`NAME=`) is a REQUIRED field; a non-empty value may be pre-filled as the default. Today the file has `GHOST_SECRET=generate_with_openssl_rand_hex_32`, which risks a user deploying with that public placeholder as their secret.
- A Vectorize binding in wrangler.jsonc makes the Deploy page show empty "Dimensions" and "Metric" fields that block deploy until filled; template authors cannot pre-fill them. New users won't know "384 / cosine".
- D1 is auto-provisioned and the placeholder database_id is replaced. The button does NOT apply migrations by itself; it runs the package.json `deploy` script if present (migration command must reference the binding name, not the db name).
- `package.json > cloudflare.bindings.<NAME>.description` text shows next to the field on the Deploy page (inline markdown ok).

## CHANGE 1: secret field
worker/.dev.vars.example -> exactly these lines:
```
# GHOST_SECRET: paste the secret shown on the Ghost from the Past setup page (Deploy to Cloudflare asks for it).
# For local dev, copy this file to .dev.vars and put a long random value here (openssl rand -hex 32).
GHOST_SECRET=
```
worker/package.json `cloudflare.bindings.GHOST_SECRET.description` -> "Paste the secret from the **Ghost from the Past** setup page in Chrome (it was copied to your clipboard when you pressed Deploy). No setup page? Generate one with `openssl rand -hex 32` and paste the same value into the extension's Options later."

## CHANGE 2: fail closed on weak / placeholder secrets
worker/src/env.ts: export `function secretConfigured(env: Env): boolean` -> true only if `env.GHOST_SECRET` is a string, trimmed length >= 16, and not one of the known placeholders (`generate_with_openssl_rand_hex_32`, `YOUR_SECRET_HERE`, `changeme`; compare case-insensitively).
worker/src/index.ts: use it everywhere `!env.GHOST_SECRET` / `Boolean(env.GHOST_SECRET)` is used today (health `configured`, /api/verify 503, the authenticated-route 503, and the bearer check must not pass when not configured). Change the 503 message to: `GHOST_SECRET is missing or too weak on this Worker. Set it in the Cloudflare dashboard (Workers & Pages > your Worker > Settings > Variables and Secrets, type Secret) to the value from the Ghost setup page.` Add unit tests for secretConfigured in worker/test/auth.test.ts (or a new worker/test/env.test.ts).

## CHANGE 3: Vectorize optional, D1 by default
worker/wrangler.jsonc: remove the top-level `vectorize` block so the button asks no Vectorize questions; the code already falls back to D1VectorStore when env.VECTORS is absent (vectorMode()). Add a short comment where it was:
```
// Optional: Vectorize instead of the D1 vector table (faster at large scale).
// npx wrangler vectorize create ghost-memory --preset @cf/baai/bge-small-en-v1.5
// then add: "vectorize": [{ "binding": "VECTORS", "index_name": "ghost-memory" }]
```
Keep `ai` (Workers AI is on the free plan), `d1_databases` (keep binding DB, database_name ghost-memory, the placeholder id, migrations_dir), `ratelimits`, `vars`, `observability`, and the `env.local` block unchanged. Make sure nothing else assumes VECTORS exists (typecheck).

## CHANGE 4: migrations applied by the button, plus a runtime safety net
a. worker/package.json scripts: `"db:migrations:apply": "wrangler d1 migrations apply DB --remote"`, `"deploy": "npm run db:migrations:apply && wrangler deploy"` (keep the other scripts).
b. Safety net in case a user edits the deploy command: worker/src/schema.ts exporting `ensureSchema(db)` that, once per isolate (module-level promise memo; reset the memo on failure so the next request retries), checks `SELECT name FROM sqlite_master WHERE type='table' AND name='pages'` and, only if missing, creates the schema by running the statements of worker/migrations/0001_init.sql (all already `IF NOT EXISTS`) as individual prepared statements via `db.batch([...])`. Keep the SQL in a TS array mirroring 0001_init.sql exactly (add a comment that the two must stay in sync). Call it at the start of every route that touches D1 (not for GET / and /health, which must stay DB-free, and not for OPTIONS). Add a unit test with a tiny fake db object (check: runs DDL when the table is missing, skips it when present).

## Done when
`cd worker && npx tsc --noEmit && npx vitest run` and `cd extension && npm test` pass. Do not touch README.md or the extension (Hark reconciles docs after the live test). Print a short summary of the files changed at the end.

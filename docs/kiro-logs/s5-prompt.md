Task-scoped fix + review (Kiro S5). Read .kiro/steering/*.md and .kiro/specs/ghost-from-the-past/{requirements,design,tasks}.md first.

1. Fix the e2e race in tests/e2e/run.mjs step 6: after clicking #syncBtn the test waits for /Synced|Last sync/ in #lastSync, which already matches the old "Last sync: never" text, so it reads stale text. Wait for the sync reply instead (e.g. #syncBtn disabled then re-enabled, or text matching /^Synced \d+/ or /Sync problem/), with an explicit timeout of 30000 ms. Keep every other check as it is.
2. In extension/popup.js, make sure the "Last sync" line is refreshed from ghost:status after a manual sync, so it never says "never" once a sync has succeeded.
3. Review the Hark-written code against the spec and refine where it falls short (small, targeted edits, no rewrites): extension/background.js (queue, ensureSecret lock, alarms every 5 min, redaction, minDwell), extension/content.js, extension/onboarding.js, extension/options.js, worker/src/{index,ingest,search,mcp,landing,store}.ts. List each finding and what you changed.
4. Run: (cd worker && npx vitest run) and (cd extension && npm test). Both must pass. Do not start wrangler dev or Chromium yourself; Hark runs the e2e.
Never print or commit secrets. Do not touch .kiro/ except tasks.md checkboxes. End with a short summary of files changed.

Follow-up fix (Kiro S5b). Small, targeted edits only.

The S5 change made the e2e hang. After a manual sync, extension/popup.js refresh() writes "Last sync: just now · N page(s)" (from ghost:status), but tests/e2e/run.mjs step 6 now waits for /^Synced [1-9]/, which never appears, so it times out after 30 s (seen in Hark's local e2e run: "page.waitForFunction: Timeout 30000ms exceeded" at run.mjs:167).

Fix it so both agree:
1. In tests/e2e/run.mjs step 6, wait (30000 ms) until #syncBtn is enabled AND #lastSync matches /Last sync: (just now|\d+ (s|sec|min)).*· [1-9]\d* page/ or /Sync problem/ (check timeAgo() in popup.js for the exact wording and match it). Update the check() right after to test the same pattern, so a real sync of >=1 page passes and "Last sync: never" or "0 page(s)" fails.
2. Leave popup.js refreshing from ghost:status (do not reintroduce the override).
3. Run (cd extension && npm test). Do not start wrangler or Chromium; Hark runs the e2e.
Never print or commit secrets. End with the diff summary.

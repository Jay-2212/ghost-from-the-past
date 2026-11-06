# Final pre-submission audit: Ghost from the Past

REVIEWER: Kiro (claude-opus-5.5), 2026-11-06. Read-only review of `/workspace/work/gfp-rel`. There is no `.git` here and I had no shell access, so I could not check tracked files, the zip contents, or GitHub About.

## A. Verdict: NOT READY today (code: READY WITH FIXES)

The product is solid. The submission is missing a required item (the video), and the Kiro story has two problems a judge can check in a few minutes.

## B. Hard requirements

| Requirement | Status | Evidence |
|---|---|---|
| Working app | PASS | `shots/e2e-results.json`: 26/26 against a fresh deployed Worker. Test counts match: worker 45, extension 36. |
| Built with Kiro | AT RISK | README ~L363 and ~L417 say most app code was written by Hark "while Kiro credits were exhausted". |
| App URL / test build | PARTIAL | `release/ghost-from-the-past-extension-v1.0.0.zip` exists, but the README never mentions it (L102 says clone). Judges get no test Worker URL or secret. |
| Feature description | PASS | README "What It Does" and "MCP Tools". |
| Demo video < 3 min | **FAIL** | No video link in the README or docs. |
| OSI license | PASS (file) | `LICENSE` is MIT. GitHub About detection not verified. |
| `/.kiro` present, not ignored | PASS | `.kiro/steering/{product,tech,design-language}.md`, `.kiro/specs/ghost-from-the-past/{requirements,design,tasks}.md` (76/76 ticked), `.kiro/hooks/*`. `.gitignore` has `!.kiro/`. `.kiro/agents/` is empty, so git won't commit it. |
| OSS disclosure | PASS | `THIRD_PARTY.md` (Readability Apache-2.0, Turndown MIT). |
| Kiro write-up | PASS, with flaws | README "How Kiro Built This" (see D). |
| No node_modules or secrets | PASS (working tree) | `.gitignore` covers `node_modules/`, `.wrangler/`, `.dev.vars`. `wrangler.jsonc` uses a placeholder DB id. |

## C. Scores

| Criterion | Score | Biggest lever |
|---|---|---|
| Potential Impact | 7 | A 20-second "I forgot that article, my AI found it" moment in the video. |
| Technological Implementation (Kiro use) | 4 | Make the hooks real (a `.kiro/agents/*.json` with preToolUse/postToolUse hooks), and record one Kiro session that uses Ghost's own MCP server. |
| Design | 7 | The README deploy section is stale (Vectorize, manual secret step). Fix it so judges get a clean path. |
| Innovation | 7 | Frame it as a Frankenstein: browser memory, edge DB, embeddings and MCP, combined into an AI recall tool you own. |
| Presentation | 2 | No video yet. A video shown end to end is worth about 5 points. |

## D. Remaining issues

**Blockers**
1. **No demo video.** Record under 3 minutes covering install, onboarding, Deploy, browsing, sync, then Claude or Kiro answering from memory. Use no music, or royalty-free music. Blur the secret.
2. **Kiro session logs are probably not in the repo.** `.gitignore` line 4 has `*.log`, which ignores every `docs/kiro-logs/*.log` that the README links to. My grep tool skipped those files because of this rule. Run `git ls-files docs/kiro-logs`. If the logs are missing, rename them to `.log.txt` or add `!docs/kiro-logs/*.log`.
3. **The hooks don't run.** `.kiro/hooks/*.json` use `"version":"v1"` and `"trigger":"PostFileSave"`. Neither Kiro CLI nor Kiro IDE loads that format: CLI hooks live in `.kiro/agents/<name>.json` (agentSpawn/userPromptSubmit/preToolUse/postToolUse/stop). The sessions ran on the default agent (`docs/kiro-logs/run-kiro.sh`), so `secret-guard` never fired. Either add `.kiro/agents/ghost.json` with these hooks and use it in one logged session, or describe the hooks honestly as scripts.
4. **Kiro authorship framing.** The README says "Most application code was written by Hark". That is honest, but it invites disqualification for insufficient Kiro use. Keep the honesty and lead with the work Kiro did: spec-driven S1/S2/S4, S5–S10 review and fixes, S9 security, S10 deploy-button work. Also add S10, which is missing from the authorship table and the logs list, and replace "(Kiro s9 commit)" (~L413) with the real hash.

**Should-fix**
5. README L121 and ~L137 still describe creating a Vectorize index. Since S10, `worker/wrangler.jsonc` has no `vectorize` binding, so D1 is the default. Remove the Vectorize step or mark it optional.
6. README L123–127 says to run `wrangler secret put` after using the Deploy button. The Deploy page now asks for `GHOST_SECRET` itself (`worker/package.json` `cloudflare.bindings`). Say so.
7. The README links `docs/kiro-logs/s4.log`, but the file doesn't exist (only `s4-prompt.md`). There is no S3 at all. Explain the gap.
8. Release zip: point the README install step at the GitHub release download. Give judges a test Worker URL and a throwaway secret, and rotate the secret after judging.
9. The README test section (L321) leaves out the setup steps. Copy them from the `run.mjs` header: `npm install`, `npx playwright install chromium`, `cd worker && npm install`.
10. Stale steering: `product.md` L21 says forget can delete "domains, or date ranges". `tech.md` L43 says production uses Vectorize, and L78 says `timingSafeEqual`, but the code uses an XOR compare on SHA-256 hashes. Judges read steering files.
11. README L93 says CORS is sent on `/mcp` and `/health`, but `worker/src/index.ts` `withCors` also sends it on `/` and on all OPTIONS preflights. The behavior is harmless. Fix the text.
12. README L241, "Forget all pages from example.com.", contradicts the "no bulk forget" design at L63. Reword it to say "list, then forget".

**Nice-to-have**
13. README L63–64: the "untrusted" paragraph sits between the `forget` and `memory_stats` bullets and breaks the list.
14. `extension/manifest.json` has `browser_specific_settings` (Gecko), which Chrome shows as an unrecognized-key warning on chrome://extensions.
15. `tests/extractors/out/*.md` holds 94 KB of scraped Wikipedia and news text. Consider gitignoring it.
16. `docs/reviews/run-review.sh` and `docs/kiro-logs/run-kiro.sh` expose local sandbox paths. They're harmless, but add a one-line explanation.
17. The README Testing section omits `schema.test.ts` from the worker test list.

## E. "How we used Kiro" outline (from .kiro/ and docs/kiro-logs/ only)

- **Tool:** Kiro CLI, run headless (`kiro-cli chat --no-interactive`, `docs/kiro-logs/run-kiro.sh`). Prompts and logs exist for sessions S1, S2, S4 (prompt only), S5–S10.
- **Spec-driven development:** in S1, Kiro turned `docs/BRIEF.md` into `requirements.md`, `design.md` and `tasks.md`. S4 updated the specs for onboarding, privacy and extractors. All 76 tasks are ticked.
- **Steering:** `product.md`, `tech.md` (always included) and `design-language.md`.
- **Hooks:** `secret-guard.mjs` (blocks writes and commits that contain secrets) and test-on-save definitions. Fix item D3 first or describe them as scripts.
- **Vibe coding:** S5–S10 used task-scoped prompts for the e2e race fix, popup undo, live extractor check, pre-release audit, security fixes (S9) and Deploy-button hardening (S10, 45/45 tests).
- **Multi-agent review:** Grok and Gemini reviews in `docs/reviews/`, fixed by Kiro in S9 (`docs/security-review.md`).
- **MCP:** the product is an MCP server, with Kiro CLI config in the README. No log shows Kiro using MCP during development.
- **Not used (don't claim):** custom agents, property-based testing, Kiro powers.

## A. Verdict: READY WITH FIXES

The extension, Worker, and MCP server are a real product, and the tree matches the checks you ran today (45 `it()` calls in `worker/test`, 36 `test()` calls in `extension/test`, 26/26 ok in `shots/e2e-results.json`). Do not press Submit until a public YouTube demo exists and `main` on GitHub contains the release commit. Fix the Deploy-button instructions first so a judge can install it.

## B. Hard requirements

| Requirement | Result | Evidence |
|---|---|---|
| Built with Kiro | **Pass** | `.kiro/specs/ghost-from-the-past/{requirements,design,tasks}.md` (tasks all `[x]`), `.kiro/steering/{product,tech,design-language}.md`, `.kiro/hooks/`, `docs/kiro-logs/` S1–S2 and S5–S10. S4 has `s4-prompt.md` only. |
| Test build + instructions | **Pass, docs wrong** | `README.md` “10-Minute Setup” and “Testing”. Zip: `release/ghost-from-the-past-extension-v1.0.0.zip`. No hosted app (by design). Judges need Chrome and a Cloudflare account. |
| Feature description | **Pass** | `README.md` “What It Does”, MCP tools, privacy. |
| Demo video ≤3 min | **Fail** | No YouTube URL in the README or `docs/`. |
| OSI license + `/.kiro` not gitignored | **Pass** | Root `LICENSE` is MIT (Jay Bharti, 2026). `.gitignore` ignores `node_modules/`, `.wrangler/`, `.dev.vars`, `*.log`, `dist/`, `shots/*.tmp`, and has `!.kiro/`. Nothing ignores `.kiro/`. |
| Public GitHub tip | **Check before submit** | `.git/logs/HEAD`: `origin/main` is `c739f84`; local `main` is `614bad59` (“Release v1.0.0: packaged Chrome extension zip”) with no push. |
| OSS / pre-existing code | **Pass** | `THIRD_PARTY.md` (Readability Apache-2.0, Turndown MIT). README authorship table names Hark vs Kiro. |
| Kiro write-up | **Partial** | README “How Kiro Built This” is the right source. It omits S10 and links a missing log. |

## C. Scores (0–10)

1. **Potential impact: 7.** Real audience (people who already ask Claude about something they read). Setup is a Cloudflare account plus an unpacked extension. **Lever:** the video shows one “what did I read last week?” answer, and the pitch names that audience.
2. **Technological implementation: 7.** Real Kiro CLI sessions, specs, steering, hooks, and later security/deploy edits. Most app code is Hark, disclosed in the README. **Lever:** a Devpost answer that cites these files and does not add tools you did not use.
3. **Design: 8.** Onboarding, popup, options, blocklist, and landing page are one product (`shots/`, `.kiro/steering/design-language.md`). **Lever:** make README Option A match the button S10 actually built.
4. **Innovation: 8.** Browser capture plus the user’s own Worker, D1, Workers AI, and a remote MCP server fits Frankenstein. **Lever:** film that seam in one shot.
5. **Presentation: 4.** The README pitch is clear. The required video is missing, so this score stays low. **Lever:** a public YouTube video under 3 minutes, on device, with no third-party trademarks and no copyrighted music.

## D. Remaining issues

**Blocker**

1. Record and publish the YouTube demo. Devpost will not take the entry without it.
2. Push `614bad59` so GitHub `main` has `release/ghost-from-the-past-extension-v1.0.0.zip`. Confirm About shows MIT.

**Should-fix**

3. `README.md` lines 119–127 tell judges the Deploy button creates a Vectorize index and that they then run `wrangler secret put`. S10 removed that question (`worker/wrangler.jsonc` lines 16–18) and made `GHOST_SECRET=` a required blank field (`worker/.dev.vars.example`). D1 is provisioned by the button; migrations run from `worker/package.json` `"deploy"`. Rewrite Option A to that flow. Vectorize stays optional.
4. `README.md` line 241 (“Forget all pages from example.com”) and `.kiro/steering/product.md` line 21 (“domains, or date ranges”) describe bulk forget. `worker/src/mcp.ts` takes exact `ids` (max 50) or an exact `url`, plus `confirm: true`.
5. `README.md` line 436 links `docs/kiro-logs/s4.log`, which is not in the tree. `.gitignore` line 4 (`*.log`) will skip a new log unless you force-add it. The logs list and authorship table also skip S10 (`docs/kiro-logs/s10-prompt.md`, `s10.log`).
6. README “Known Gaps” still says 4 extractor passes and 2 gaps. `tests/extractors/out/summary.json` (2026-11-06) says 7 pass, 0 fail, 4 blocked. `docs/security-review.md` line 38 matches the JSON.
7. README says 28 local e2e checks. `shots/e2e-results.json` is 26/26 against `https://ghost-deploy-test.jb-brain.workers.dev` (2026-11-06T11:51Z). `shots/e2e-results-deployed.json` is an older 19/19. Point judges at the 26-check file.
8. Smoke the Deploy button’s GitHub connect, and one real Claude Desktop or claude.ai connector, before you film. The Desktop snippet (`README.md` lines 170–186, `npx mcp-remote`, `${GHOST_SECRET}`) has never been run. Keep the secret out of the video.

**Nice-to-have**

9. `product.md` has no steering front matter; `tech.md` (`inclusion: always`) and `design-language.md` do. `design.md` line 364 says Options can regenerate the secret; the extension has no rotate control.
10. `.kiro/agents/` is empty. Hooks use the S1 schema (`version: v1`, `trigger` / `matcher` / `action` in `.kiro/hooks/*.json`), not `*.kiro.hook`. Logs show Kiro wrote them. They do not show a hook firing.
11. Those test Worker hostnames are in `shots/`. Delete or rotate them before judges arrive. `tests/extractors/out/` and `shots/mcp-get_page-wikipedia.md` commit long third-party article text.
12. `node_modules/` is gitignored and present on disk here. The git index could not be read. Run `git ls-files node_modules` before you push.

## E. Devpost “How we used Kiro”

Kiro CLI only.

**Spec-driven.** S1 added steering (`product.md`, `tech.md` always included, `design-language.md` on extension HTML/CSS/icons), the requirements → design → tasks spec, and two hooks: `secret-guard` (PreToolUse on shell/write, `node .kiro/hooks/secret-guard.mjs`) and `test-on-save` (PostFileSave runs worker vitest or `node --test extension/test`). S2 scaffolded the Worker (auth, chunk, embed, store, util, tests). S4’s prompt updated the spec for onboarding, privacy, and extractors. That session log was not kept.

**Task prompts on that spec.** S5 fixed the e2e sync race and popup status. S6 added “Don’t remember this site” and `tests/extractors/live.mjs`. S7 wrote the README and `THIRD_PARTY.md`. S8 fixed the MV3 background, fetch timeouts, and the GitHub and news extractors (`docs/kiro-logs/s8-audit.md`). S9 applied the reviewed security fixes (origin-bound HMAC before the secret is sent, `?token=` off unless `ALLOW_QUERY_TOKEN`, exact-id `forget`, untrusted-content framing, blocklist, CORS, redaction, rate limit). S10 made the Deploy to Cloudflare button safe for a free account: blank `GHOST_SECRET`, no Vectorize question, migrations in the deploy script, `ensureSchema` as a fallback.

**Leave out.** Custom agents, property-based testing, and Kiro powers. `design.md` “Correctness Properties” are written invariants, not a property-test library. MCP is the product: the Worker exposes `search_memory`, `list_pages`, `get_page`, `forget`, and `memory_stats`. S7b only added a Kiro CLI client snippet in the README.

**Say this plainly.** Most application code was written by Hark while Kiro credits were exhausted. Kiro wrote the steering, specs, hooks, and scaffold, and from S5 on reviewed and changed the code.
EXIT 0

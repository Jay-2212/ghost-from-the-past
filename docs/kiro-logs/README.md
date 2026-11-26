# Kiro session logs

Every Kiro session for this project ran headless with Kiro CLI in a cloud sandbox, started by [`run-kiro.sh`](run-kiro.sh):

```bash
docs/kiro-logs/run-kiro.sh <name> <model> <promptfile>
```

The script points `HOME` and `PATH` at the sandbox's Kiro CLI install, changes into the repo, and runs:

```bash
kiro-cli chat --no-interactive --trust-all-tools --model "<model>" "$(cat <promptfile>)" > docs/kiro-logs/<name>.log 2>&1
```

It then appends `EXIT <code>` to the log. `--no-interactive` means Kiro gets one prompt and works until it is done, with no human turns. `--trust-all-tools` lets it run shell commands and write files without asking. The paths in the script (`/workspace/...`) are the sandbox's, not something you need locally.

S1 to S10 ran on the default agent, as the script above shows. S11b ran on the `ghost` custom agent ([`.kiro/agents/ghost.json`](../../.kiro/agents/ghost.json), selected with `kiro-cli chat --agent ghost`), which loads the steering and specs and runs the hooks described in [`.kiro/hooks/README.md`](../../.kiro/hooks/README.md). `run-kiro.sh` itself was not changed.

## Naming

- `sN-prompt.md`: the prompt given to session N, written by Hark or the product owner.
- `sN.log`: everything Kiro printed in that session (tool calls, its messages, the final summary), plus the `EXIT` line.
- `sNb`, `sNc`: a follow-up session on the same task, usually fixing what a review of session N found. S11 has `s11b-prompt.md` and `s11c-prompt.md` (the prompt that finished S11a and then ran S11b) but one log, `s11b.log`.
- `s15-prompt.md` / `s15.log`: the mischief and UX polish pass. Hark's orchestration prompt, then Kiro CLI doing the work. e2e did not run in that sandbox (no Chromium system libraries); S15d ran it. Review round (`s15b-prompt.md` / `s15b.log`): Meta muse-spark reviewed the uncommitted changes via API ([docs/reviews/s15-meta-review.md](../reviews/s15-meta-review.md)); Kiro verified each point and fixed it, with replies in that file. Copy round (`s15c`): Meta muse-spark wrote a copy deck ([docs/reviews/s15c-meta-copy-deck.js](../reviews/s15c-meta-copy-deck.js)) after s15b over-flattened the wit; Kiro merged it into `strings.js`, fixed clumsy lines, and loosened the copy test to ban only surveillance phrasing. Run round (`s15d`): with the missing libraries supplied via `LD_LIBRARY_PATH`, e2e ran 28/28 against local wrangler dev with live pages; popup ghost-guide screenshots added.
- `s8-audit.md`: the audit report Kiro wrote in S8.

Gaps: there was no S3 session, and the S4 log was not kept (only `s4-prompt.md`). S11a was cut off by a timeout; `s11a.log` stops where it ended, and its last checks were run at the start of S11b.

`*.log` is in `.gitignore`, so the logs here are added with `git add -f`.

The independent reviews that fed S9 and S11b, and the script that ran them, are in [`docs/reviews/`](../reviews/).

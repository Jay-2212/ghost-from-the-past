# Hooks

These scripts run as Kiro CLI hooks through the `ghost` custom agent, [`.kiro/agents/ghost.json`](../agents/ghost.json). Kiro CLI only runs hooks defined in an agent file, so they fire only in sessions started with `kiro-cli chat --agent ghost`.

## History

S1 wrote `secret-guard.json` and `test-on-save.json` in an invented format (`"version": "v1"`, `"trigger": "PostFileSave"`). Kiro CLI never loaded that format, so sessions S1 to S10 ran on the default agent and no hook ever fired. S11a deleted those two files, rewrote `secret-guard.mjs` to read Kiro's hook event, added `test-on-write.mjs`, and created the agent. S11b was the first session run on it.

## What the agent wires up

| Hook | Matcher | Command | Effect |
|------|---------|---------|--------|
| `agentSpawn` | | `echo branch; git status --short` | Puts the branch and working-tree state in the agent's context. |
| `preToolUse` | `fs_write`, `execute_bash`, `code` | `node .kiro/hooks/secret-guard.mjs` | Exit 2 blocks the tool call; stderr goes back to the model. |
| `postToolUse` | `fs_write` | `node .kiro/hooks/test-on-write.mjs` (90 s timeout) | Runs the matching fast test suite and prints the result. Never blocks. |
| `stop` | | `echo` reminder | Reminds the agent to run the full suites before committing. |

Kiro passes each hook a JSON event on stdin, for example:

```json
{ "hook_event_name": "preToolUse", "cwd": "/path/to/repo", "tool_name": "fs_write",
  "tool_input": { "command": "create", "path": "worker/src/x.ts", "file_text": "..." } }
```

## secret-guard.mjs

Scans what a tool is about to write or run and blocks it (exit 2) on:

- `GHOST_SECRET=<value>` or Cloudflare API token/key assignments with a real-looking value (placeholders such as `YOUR_SECRET_HERE` and blank values pass);
- provider token shapes: Cloudflare `cfut_`/`cfat_`/`cfct_`, AWS, GitHub, `sk-` keys, Slack, JWTs, `Bearer <token>`, private key blocks;
- any 40+ character high-entropy string (a 40-char git SHA is allowed). This rule is skipped for docs, tests, fixtures, vendor files and lockfiles, which are full of long hashes;
- a write to `.dev.vars` (`.dev.vars.example` is fine).

For `fs_write`/`code` it scans every string in `tool_input` except the path and the text being replaced. For `execute_bash` it scans the command, and on `git commit`/`git push` it also scans the added lines of `git diff --cached`. Run with no `tool_name` (for example by hand in a terminal) it scans the staged diff, as the S1 version did.

It never prints what it found, only the rule, the location and the length. A JSON parse error or internal error also exits 2, so a broken event fails closed.

Limits: it is a pattern scanner. It can't see a secret split across tool calls or encoded, and it doesn't stop a command from reading `.dev.vars`. A long random-looking literal in a shell command, such as a 62-character alphabet in a test script, is blocked as a false positive; build such strings in code instead.

## test-on-write.mjs

After a successful `fs_write`:

- a `worker/**` `.ts`/`.js`/`.mjs`/`.sql` file runs `npx vitest run --reporter=dot` in `worker/`;
- an `extension/**` `.js`/`.mjs`/`.cjs`/`.json` file runs `node --test` on every `extension/test/*.test.*` file;
- anything else does nothing.

It prints a pass/fail line, with the last 40 lines of output on failure. A failure exits 1, which Kiro shows as a warning; the session carries on. The script stops each suite after 80 s. Set `GHOST_SKIP_TEST_HOOK=1` to turn it off.

It runs the fast unit suites only. Typecheck and e2e are left to the final checks the agent prompt requires.

## Checking the hooks by hand

```bash
kiro-cli agent validate --path .kiro/agents/ghost.json      # prints nothing when valid

echo '{"hook_event_name":"preToolUse","tool_name":"execute_bash","tool_input":{"command":"git status"}}' \
  | node .kiro/hooks/secret-guard.mjs; echo "exit $?"         # exit 0
```

To see a block, generate a random 48-character token inside `node` (so it never appears in your shell history), put it in a `file_text` field of an `fs_write` event, and pipe that event in: the script exits 2 with a reason on stderr. Note that `kiro-cli agent validate` exits 0 even for an invalid file (it prints `Error: ... invalid`), so read its output rather than its exit code.

Session S11a was cut off by a timeout. Before doing S11b's work, finish S11a:
1. Confirm .kiro/agents/ghost.json loads: `kiro-cli agent validate --path .kiro/agents/ghost.json`.
2. Check .kiro/hooks/secret-guard.mjs works as a Kiro preToolUse hook.
   - A hook event (JSON on stdin) whose tool input contains a fake random 48-char token must exit 2 and print a reason on stderr.
   - A harmless event must exit 0.
   - Run both cases and paste the exit codes.
3. Check .kiro/hooks/test-on-write.mjs also runs cleanly on a harmless event.
Then do everything in docs/kiro-logs/s11b-prompt.md (read it now).
Keep every change uncommitted. At the end, print a short summary: files changed, test results (worker npm test + typecheck, extension npm test), and anything you could not do.

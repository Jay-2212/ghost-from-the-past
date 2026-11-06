S11a: Create a real Kiro CLI custom agent for this repo, so our hooks actually fire.

Two pre-submission audits (docs/reviews/final-audit-kiro-opus.md and a Grok audit) found that `.kiro/hooks/*.json` use an invented schema ("version":"v1", "trigger":"PostFileSave") that Kiro CLI doesn't load. Our sessions ran on the default agent, so secret-guard never fired.

Task:
1. Using the official Kiro CLI custom-agent format (`.kiro/agents/<name>.json`: name, description, prompt, tools, allowedTools, resources, and hooks with agentSpawn / userPromptSubmit / preToolUse / postToolUse / stop, each preToolUse/postToolUse entry with a matcher and command), create `.kiro/agents/ghost.json`:
   - resources: file://.kiro/steering/*.md and the spec files in .kiro/specs/ghost-from-the-past/
   - hooks:
     - agentSpawn: print `git status --short` and the current branch
     - preToolUse on fs_write and execute_bash: run `node .kiro/hooks/secret-guard.mjs`, which reads the hook event JSON on stdin and exits 2 with a message to block any write or command that contains a 40+ char high-entropy secret, a `GHOST_SECRET=` value, a Cloudflare token pattern, or a `.dev.vars` write
     - postToolUse on fs_write: run the relevant fast test (`cd worker && npx vitest run --reporter=dot` for worker/ files, `node --test extension/test` for extension/ files). Keep it quick; never fail the session on a test error, just print it.
     - stop: print a one-line reminder to run the full test suites
2. Update `.kiro/hooks/secret-guard.mjs` so it works with the Kiro CLI hook stdin event JSON (tool_name / tool_input), keeping any existing CLI behaviour. Add `.kiro/hooks/test-on-write.mjs` for the postToolUse logic.
3. Delete or replace the old invented-schema `.kiro/hooks/*.json` files, and update `.kiro/hooks/README.md` (create it if missing) to explain the agent + hooks honestly.
4. Prove the guard works: pipe a fake preToolUse event containing a fake 48-char secret into secret-guard.mjs and show exit code 2. Then pipe a harmless one and show exit 0.

Do not touch the worker or extension source in this session. Do not commit.

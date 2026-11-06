#!/usr/bin/env node

/**
 * test-on-write.mjs: run the fast test suite that matches a file the agent just wrote.
 *
 * Runs as a Kiro CLI `postToolUse` hook on fs_write (see .kiro/agents/ghost.json). Kiro passes
 * the hook event as JSON on stdin:
 *
 *   { "hook_event_name": "postToolUse", "cwd": "...", "tool_name": "fs_write",
 *     "tool_input": { "path": "worker/src/search.ts", ... }, "tool_response": { "success": true, ... } }
 *
 *   worker/**.{ts,js,mjs,sql}     -> (cd worker && npx vitest run --reporter=dot)
 *   extension/**.{js,mjs,cjs,json} -> node --test <every extension/test/*.test.* file>
 *   anything else                 -> nothing
 *
 * The tool has already run when a postToolUse hook starts, so this script can never block it.
 * A test failure is reported, not enforced: the output goes to stdout and stderr, and the exit
 * code is 1. Kiro CLI shows stderr from a non-zero postToolUse hook as a warning and carries on,
 * so the session continues. Passing runs, skipped files and tool errors exit 0.
 *
 * Set GHOST_SKIP_TEST_HOOK=1 to turn it off (for example during a long multi-file refactor).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 80_000; // keep below timeout_ms in .kiro/agents/ghost.json
const TAIL_LINES = 40;

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

/** Which suite, if any, covers this file? `rel` is relative to the repo root with forward slashes. */
function suiteFor(rel) {
  if (!rel || rel.startsWith('../')) return null;
  if (/(^|\/)(?:node_modules|\.wrangler|dist)\//.test(rel)) return null;
  const ext = path.extname(rel).toLowerCase();
  if (rel.startsWith('worker/') && ['.ts', '.js', '.mjs', '.sql'].includes(ext)) return 'worker';
  if (rel.startsWith('extension/') && ['.js', '.mjs', '.cjs', '.json'].includes(ext)) return 'extension';
  return null;
}

function paths(input) {
  const out = [];
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      for (const k of ['path', 'file_path', 'filePath']) if (typeof v[k] === 'string') out.push(v[k]);
      Object.values(v).forEach((x) => typeof x === 'object' && visit(x));
    }
  };
  visit(input);
  return out;
}

function run(label, cmd, args, cwd) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.error && r.error.code === 'ETIMEDOUT') {
    return { ok: false, message: `${label} timed out after ${TIMEOUT_MS / 1000}s. Run the suite manually.` };
  }
  if (r.error) return { ok: false, message: `${label} could not start: ${r.error.message}` };
  if (r.status === 0) return { ok: true, message: `${label} passed (${seconds}s)` };
  const tail = out.split('\n').slice(-TAIL_LINES).join('\n');
  return { ok: false, message: `${label} FAILED (exit ${r.status}, ${seconds}s). Last ${TAIL_LINES} lines:\n${tail}` };
}

async function main() {
  if (process.env.GHOST_SKIP_TEST_HOOK === '1') return 0;

  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw || '{}');
  } catch {
    console.error('test-on-write: could not parse the hook event JSON; skipping tests.');
    return 0;
  }
  if (event.tool_response && event.tool_response.success === false) return 0; // the write failed

  const root = event.cwd || process.cwd();
  const suites = new Set();
  for (const p of paths(event.tool_input || {})) {
    const rel = path.relative(root, path.resolve(root, p)).split(path.sep).join('/');
    const suite = suiteFor(rel);
    if (suite) suites.add(suite);
  }
  if (suites.size === 0) return 0;

  let failed = false;
  const lines = [];
  if (suites.has('worker')) {
    const r = run('worker tests (vitest)', 'npx', ['vitest', 'run', '--reporter=dot'], path.join(root, 'worker'));
    lines.push(r.message);
    failed ||= !r.ok;
  }
  if (suites.has('extension')) {
    // Pass explicit files: `node --test <dir>` is not supported by Node 22.
    const testDir = path.join(root, 'extension', 'test');
    const files = fs.existsSync(testDir)
      ? fs.readdirSync(testDir).filter((f) => /\.test\.[cm]?js$/.test(f)).sort().map((f) => path.join('extension', 'test', f))
      : [];
    if (files.length === 0) {
      lines.push('extension tests: no extension/test/*.test.* files found, skipped');
    } else {
      const r = run('extension tests (node --test)', process.execPath, ['--test', ...files], root);
      lines.push(r.message);
      failed ||= !r.ok;
    }
  }

  const report = `test-on-write:\n${lines.join('\n')}`;
  console.log(report);
  if (failed) console.error(report);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // Never turn a hook bug into a blocked or failed session.
    console.error(`test-on-write: internal error (${err && err.message ? err.message : err}); skipped.`);
    process.exit(0);
  }
);

#!/usr/bin/env node

/**
 * secret-guard.mjs: block writes and commands that would leak a secret.
 *
 * Runs as a Kiro CLI `preToolUse` hook (see .kiro/agents/ghost.json). Kiro writes the
 * hook event as JSON on stdin:
 *
 *   { "hook_event_name": "preToolUse", "cwd": "...", "tool_name": "fs_write",
 *     "tool_input": { ...tool arguments... } }
 *
 * Exit codes (Kiro CLI contract): 0 = allow, 2 = block (stderr is returned to the model).
 * Any other exit code is only a warning and the tool still runs, so every failure path
 * below exits 2 on purpose.
 *
 * Modes
 *  - Hook mode (event has tool_name): scans what the tool is about to write or run.
 *      write tools (fs_write, write, code): every string in tool_input except path/old text
 *      shell tools (execute_bash, shell):   tool_input.command; also the staged git diff
 *                                           when the command is `git commit` or `git push`
 *  - Legacy CLI mode (no tool_name, e.g. `echo '{"path":"x.ts"}' | node secret-guard.mjs`,
 *    or run by hand in a terminal): scans the staged git diff and, if given, the file at
 *    `path`. This is the behaviour the script had before it learned the Kiro event format.
 *
 * What it blocks
 *  - GHOST_SECRET=<value>, CLOUDFLARE_API_TOKEN=<value> style assignments with a real-looking value
 *  - provider tokens (AWS, GitHub, OpenAI/Anthropic-style sk-, Slack, Cloudflare cf*t_, JWT,
 *    Bearer, private key blocks)
 *  - any 40+ character high-entropy token (random hex longer than a 40-char git SHA, or mixed
 *    letters+digits with high Shannon entropy)
 *  - writing .dev.vars (not .dev.vars.example)
 *
 * What it does not do: it is a pattern scanner, not a vault. It cannot see a secret that is
 * split across tool calls or encoded, and it does not stop `cat .dev.vars` from reading one.
 *
 * It never prints the secret it found: only the rule, the location and the token length.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const PLACEHOLDER = /^(?:generate|todo|example|your|xxx|changeme|placeholder|replace|dummy|fake|redacted|<|\$|\{)/i;
const VALUE_SHAPE = /^[A-Za-z0-9_\-+=/]{16,}$/;

/** `NAME=value`, `NAME: value`, `"NAME": "value"` where value looks like a real secret. */
function assignmentRule(name, names) {
  const re = new RegExp(`\\b(?:${names.join('|')})\\b["']?[ \\t]*[=:][ \\t]*["']?([^\\s"'\`,;)}\\]]+)`, 'gi');
  return {
    name,
    find(text) {
      for (const m of text.matchAll(re)) {
        const value = m[1];
        if (VALUE_SHAPE.test(value) && !PLACEHOLDER.test(value)) return value;
      }
      return null;
    },
  };
}

function regexRule(name, re, accept = () => true) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return {
    name,
    find(text) {
      for (const m of text.matchAll(g)) {
        if (accept(m)) return m[0];
      }
      return null;
    },
  };
}

// Always applied (every path except *.example).
const NAMED_RULES = [
  assignmentRule('GHOST_SECRET value', ['GHOST_SECRET']),
  assignmentRule('Cloudflare API token/key assignment', ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'CF_API_KEY']),
  regexRule('Cloudflare token (cfut_/cfat_/cfct_)', /\bcf(?:ut|at|ct)_[A-Za-z0-9]{30,}/),
  regexRule('Cloudflare Global API Key header', /X-Auth-Key:\s*[0-9a-f]{37}\b/i),
  regexRule('AWS access key id', /\bAKIA[0-9A-Z]{16}\b/),
  regexRule('AWS secret access key', /aws_secret_access_key["']?\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/i),
  regexRule('GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/),
  regexRule('sk- API key', /(?<![A-Za-z0-9])sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/, (m) => !/^sk-example/i.test(m[0])),
  regexRule('Slack token', /\bxox[baprs]-(?!example)[A-Za-z0-9-]{20,}/),
  regexRule('JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/),
  regexRule('Bearer token', /\bBearer\s+([A-Za-z0-9_\-.]{20,})/i, (m) => !PLACEHOLDER.test(m[1])),
  regexRule('private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/),
];

function shannonEntropy(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** A 40+ char token that looks randomly generated. */
function looksHighEntropy(token) {
  if (token.length < 40) return false;
  if (/^sha(?:1|256|384|512)-/i.test(token)) return false; // subresource-integrity hashes
  const hex = /^[0-9a-f]+$/i.test(token);
  if (hex) {
    if (token.length === 40) return false; // git SHA-1; GHOST_SECRET is 64 hex chars
    return shannonEntropy(token) >= 3.0;
  }
  const upper = /[A-Z]/.test(token);
  const lower = /[a-z]/.test(token);
  const digit = /[0-9]/.test(token);
  if (!digit || !(upper || lower)) return false;
  const h = shannonEntropy(token);
  return upper && lower ? h >= 4.0 : h >= 4.2;
}

const ENTROPY_RULE = {
  name: 'high-entropy token (40+ chars)',
  find(text) {
    for (const m of text.matchAll(/[A-Za-z0-9_\-+]{40,}={0,2}/g)) {
      const before = text.slice(Math.max(0, m.index - 7), m.index);
      if (/base64,$/i.test(before)) continue; // inline data URIs
      if (looksHighEntropy(m[0])) return m[0];
    }
    return null;
  },
};

// Paths whose *content* is exempt from the broad entropy heuristic (docs, fixtures, generated).
function isFixtureOrDocPath(p) {
  if (!p) return false;
  const base = path.basename(p);
  const norm = p.split(path.sep).join('/');
  return (
    /\.(?:md|example|lock|svg|png|jpe?g|gif|ico|map)$/i.test(base) ||
    base === 'package-lock.json' ||
    base === '.gitignore' ||
    /(^|\/)(?:tests?|vendor|node_modules|dist)\//.test(norm) ||
    /\.test\.[cm]?[jt]sx?$/.test(base)
  );
}

function isExamplePath(p) {
  return !!p && path.basename(p).endsWith('.example');
}

/** Is `p` a .dev.vars file other than .dev.vars.example? */
function isDevVarsPath(p) {
  if (!p) return false;
  const base = path.basename(p);
  return /^\.dev\.vars(\..+)?$/.test(base) && !base.endsWith('.example');
}

/**
 * Scan text that is going to `filePath` (or into a shell command when filePath is empty).
 * Returns { rule, length } for the first finding, else null.
 */
function scanContent(text, filePath = '') {
  if (!text || isExamplePath(filePath)) return null;
  for (const rule of NAMED_RULES) {
    const hit = rule.find(text);
    if (hit) return { rule: rule.name, length: hit.length };
  }
  if (!isFixtureOrDocPath(filePath)) {
    const hit = ENTROPY_RULE.find(text);
    if (hit) return { rule: ENTROPY_RULE.name, length: hit.length };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shell commands
// ---------------------------------------------------------------------------

const WRITE_OPERATOR = /(?:^|[^<>0-9&])>{1,2}|\btee\b|\b(?:cp|mv|ln|install|rsync|touch|truncate)\b|\bsed\b[^|;&\n]*\s-i|\bdd\b[^|;&\n]*\bof=/;

/** True when a shell command appears to write .dev.vars (not .dev.vars.example). */
function commandWritesDevVars(cmd) {
  if (!/\.dev\.vars(?!\.example)(?![\w-])/.test(cmd)) return false;
  // Ignore fd redirects such as 2>&1 and >/dev/null so `cat .dev.vars 2>&1` is not a "write".
  const stripped = cmd.replace(/\d*>&\d+/g, '').replace(/\d*>{1,2}\s*\/dev\/null/g, '');
  return WRITE_OPERATOR.test(stripped);
}

function commandIsGitCommitOrPush(cmd) {
  return /\bgit\s+(?:-[^\s]+\s+(?:\S+\s+)?)*(?:commit|push)\b/.test(cmd);
}

// ---------------------------------------------------------------------------
// Staged diff
// ---------------------------------------------------------------------------

function stagedDiff(cwd) {
  try {
    return execFileSync('git', ['diff', '--cached', '--no-color', '-U0'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return ''; // not a git repo, or git missing
  }
}

/** Scan only the added lines of the staged diff, file by file, using the same path rules as writes. */
function scanStagedDiff(cwd) {
  const diff = stagedDiff(cwd);
  if (!diff) return null;
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const header = section.split('\n', 1)[0];
    const m = header.match(/ b\/(.+)$/);
    const file = m ? m[1] : '';
    if (isDevVarsPath(file)) return { rule: '.dev.vars is staged', length: 0, where: `staged ${file}` };
    const added = section
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1))
      .join('\n');
    const hit = scanContent(added, file);
    if (hit) return { ...hit, where: `staged ${file}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool input
// ---------------------------------------------------------------------------

const SHELL_TOOLS = new Set(['execute_bash', 'execute_cmd', 'shell']);
// Keys holding text that is being removed or metadata, not text being written.
const SKIP_KEYS = new Set(['path', 'file_path', 'filePath', 'oldStr', 'old_str', 'summary', '__tool_use_purpose']);

function isShellTool(event) {
  return SHELL_TOOLS.has(event.tool_name) || (event.tool_tags || []).includes('shell');
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (!SKIP_KEYS.has(k)) collectStrings(v, out);
    }
  }
  return out;
}

function targetPaths(input) {
  const paths = [];
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      for (const k of ['path', 'file_path', 'filePath']) if (typeof v[k] === 'string') paths.push(v[k]);
      Object.values(v).forEach((x) => typeof x === 'object' && visit(x));
    }
  };
  visit(input);
  return paths;
}

function checkHookEvent(event) {
  const cwd = event.cwd || process.cwd();
  const input = event.tool_input || {};

  if (isShellTool(event)) {
    const command = typeof input.command === 'string' ? input.command : '';
    if (commandWritesDevVars(command)) return { rule: 'write to .dev.vars', length: 0, where: 'shell command' };
    const hit = scanContent(command);
    if (hit) return { ...hit, where: 'shell command' };
    if (commandIsGitCommitOrPush(command)) return scanStagedDiff(cwd);
    return null;
  }

  // Write-like tools (fs_write, write, code, ...): check target path(s) and everything being written.
  const paths = targetPaths(input);
  for (const p of paths) {
    if (isDevVarsPath(p)) return { rule: 'write to .dev.vars', length: 0, where: p };
  }
  const text = collectStrings(input).join('\n');
  const where = paths[0] || 'tool input';
  const hit = scanContent(text, paths[0] || '');
  return hit ? { ...hit, where } : null;
}

// ---------------------------------------------------------------------------
// Legacy CLI mode
// ---------------------------------------------------------------------------

function checkLegacy(context) {
  const cwd = context.cwd || process.cwd();
  const staged = scanStagedDiff(cwd);
  if (staged) return staged;
  const filePath = context.path || '';
  if (filePath && !isExamplePath(filePath)) {
    try {
      const content = fs.readFileSync(path.resolve(cwd, filePath), 'utf-8');
      const hit = scanContent(content, filePath);
      if (hit) return { ...hit, where: filePath };
    } catch {
      // File may not exist yet or be unreadable; nothing to scan.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function block(finding) {
  const size = finding.length ? `, ${finding.length} chars` : '';
  console.error(
    `secret-guard: BLOCKED. ${finding.rule} in ${finding.where}${size}. ` +
      'Do not write real secrets into files or commands. Use a placeholder, an environment variable, ' +
      'or worker/.dev.vars.example, and let the user put the real value in place themselves.'
  );
  process.exit(2);
}

async function main() {
  const raw = await readStdin();
  let event = {};
  if (raw.trim()) {
    try {
      event = JSON.parse(raw);
    } catch {
      console.error('secret-guard: BLOCKED. Could not parse the hook event JSON on stdin, so nothing could be checked.');
      process.exit(2);
    }
  }
  const finding = event && event.tool_name ? checkHookEvent(event) : checkLegacy(event || {});
  if (finding) block(finding);
  process.exit(0);
}

main().catch((err) => {
  console.error(`secret-guard: BLOCKED. Internal error (${err && err.message ? err.message : err}).`);
  process.exit(2);
});

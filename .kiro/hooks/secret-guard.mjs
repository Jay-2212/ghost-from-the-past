#!/usr/bin/env node

/**
 * secret-guard.mjs — Pre-write hook to scan for secrets
 * Reads hook context from stdin, scans git diff --cached and file paths for secrets
 * Ignores: *.example, *.md, .gitignore, test fixtures
 * Only blocks real-looking values (16+ chars for GHOST_SECRET, etc.)
 * Exits 2 if secrets found (blocks write), 0 otherwise
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Patterns that look like REAL values (not examples or placeholders)
const SECRET_PATTERNS = [
  // GHOST_SECRET=<16+ non-placeholder chars>
  /GHOST_SECRET\s*=\s*['"]?(?!generate|todo|example|xxx|123)[a-f0-9]{16,}['"]?/i,
  // Bearer <long token>
  /Bearer\s+(?!generate|todo|example|xxx)[a-zA-Z0-9_\-\.]{20,}/i,
  // CLOUDFLARE_API_TOKEN=<value>
  /CLOUDFLARE_API_TOKEN\s*=\s*['"]?(?!generate|todo|example|xxx)[a-zA-Z0-9_\-]{16,}['"]?/i,
  // .dev.vars file (staged, not .example)
  /\.dev\.vars\s*$/m,
  // AWS keys
  /AKIA[0-9A-Z]{16}/,
  // GitHub tokens
  /ghp_[a-zA-Z0-9]{36,}/,
  // OpenAI keys
  /sk-(?!example|proj-)[a-zA-Z0-9]{48,}/,
  // Slack tokens
  /xox[baprs]-(?!example)[a-zA-Z0-9_\-]{50,}/,
  // JWT tokens
  /eyJ[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9_\-\.]+/,
  // Private key blocks
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

// Files to skip entirely
function shouldSkipFile(filePath) {
  if (!filePath) return false;
  const baseName = path.basename(filePath);
  return baseName.endsWith('.example') ||
         baseName.endsWith('.md') ||
         baseName === '.gitignore' ||
         filePath.includes('/test/') ||
         filePath.includes('/tests/') ||
         filePath.includes('.test.');
}

async function scanFile(filePath) {
  if (shouldSkipFile(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }
  } catch (e) {
    // File may not exist yet or be unreadable; skip
  }
  return false;
}

async function scanDiffCached() {
  try {
    const diff = execSync('git diff --cached', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(diff)) {
        return true;
      }
    }
  } catch (e) {
    // Not a git repo; skip
  }
  return false;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const context = JSON.parse(input || '{}');
  const filePath = context.path || '';

  // Check git diff --cached
  if (await scanDiffCached()) {
    console.error('❌ Secret pattern detected in staged changes. Commit blocked.');
    process.exit(2);
  }

  // Check the file being written (if provided)
  if (filePath && await scanFile(filePath)) {
    console.error(`❌ Real-looking secret detected in ${filePath}. Write blocked.`);
    process.exit(2);
  }

  process.exit(0);
}

main().catch(() => process.exit(2));

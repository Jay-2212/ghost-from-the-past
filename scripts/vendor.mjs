// Copies the two third-party libraries the extension bundles into extension/vendor/ (no build step).
// Run from extension/: npm install && npm run vendor
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ext = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const nm = join(ext, 'node_modules');
mkdirSync(join(ext, 'vendor'), { recursive: true });
const ver = p => JSON.parse(readFileSync(join(nm, p, 'package.json'), 'utf8')).version;
const files = [
  ['@mozilla/readability', 'Readability.js', 'Readability.js', 'Apache-2.0, Copyright (c) 2010 Arc90 Inc'],
  ['turndown', 'lib/turndown.browser.umd.js', 'turndown.js', 'MIT, Copyright (c) 2017+ Dom Christie'],
];
for (const [pkg, src, dst, lic] of files) {
  const body = readFileSync(join(nm, pkg, src), 'utf8');
  writeFileSync(join(ext, 'vendor', dst), `/*! ${pkg}@${ver(pkg)} — ${lic}. Vendored unmodified by scripts/vendor.mjs. */\n${body}`);
  console.log('vendored', pkg, ver(pkg), '->', dst);
}

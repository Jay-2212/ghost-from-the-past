#!/usr/bin/env node
// Build the Chrome / Edge / Chromium package: zip extension/ as it is (same manifest, no Firefox keys)
// to release/ghost-from-the-past-chromium-v<version>.zip, without node_modules, test or package files.
//
//   node scripts/build-chrome.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, EXT, extensionFiles, readManifest, writeZip } from './lib/pack.mjs';

const { version } = readManifest();
const files = extensionFiles();
const zip = join(ROOT, 'release', `ghost-from-the-past-chromium-v${version}.zip`);
writeZip(zip, files.map(name => ({ name, data: readFileSync(join(EXT, name)) })));
console.log(`${files.length} files`);
console.log(`wrote ${zip.slice(ROOT.length + 1)}`);

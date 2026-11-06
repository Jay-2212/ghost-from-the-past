#!/usr/bin/env node
// Build the Firefox (AMO) package: copy extension/ to dist/firefox/, write a Firefox manifest there,
// and zip it to release/ghost-from-the-past-firefox-v<version>.zip. extension/manifest.json is not touched.
//
//   node scripts/build-firefox.mjs
//   npx web-ext lint -s dist/firefox
import { rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, EXT, extensionFiles, readManifest, writeZip } from './lib/pack.mjs';

const OUT = join(ROOT, 'dist', 'firefox');
const GECKO_ID = 'ghost-from-the-past@jay-2212.github.io';
// 140 is the first desktop release with built-in data collection consent (data_collection_permissions),
// which AMO requires for new add-ons. It also covers module background scripts (112) and MV3 host
// permissions granted at install (127). 140 is an ESR, so ESR users are covered too.
const MIN_FIREFOX = '140.0';
const MIN_FIREFOX_ANDROID = '142.0';

export function firefoxManifest(chrome) {
  const m = structuredClone(chrome);
  const bg = m.background || {};
  const script = bg.service_worker || (bg.scripts && bg.scripts[0]);
  if (!script) throw new Error('manifest.json has no background script');
  // Firefox MV3 runs the background as an event page, not a service worker.
  m.background = { scripts: [script], ...(bg.type === 'module' ? { type: 'module' } : {}) };

  // Chrome-only keys Firefox ignores or rejects.
  for (const k of ['minimum_chrome_version', 'key', 'update_url', 'side_panel', 'offline_enabled', 'export', 'storage']) delete m[k];
  const CHROME_ONLY_PERMS = new Set(['offscreen', 'sidePanel', 'tabGroups', 'readingList', 'favicon', 'fontSettings', 'system.cpu', 'system.memory', 'system.display', 'system.storage', 'enterprise.platformKeys', 'enterprise.deviceAttributes']);
  if (m.permissions) m.permissions = m.permissions.filter(p => !CHROME_ONLY_PERMS.has(p));

  m.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: MIN_FIREFOX,
      // AMO policy counts anything "handled outside the add-on or the local browser" as transmission,
      // even when it goes to a server the user owns. Ghost sends the URL, title and visit times
      // (browsingActivity) and the page text (websiteContent) to the user's own Cloudflare Worker.
      // Capture is the whole product, so both are required. Nothing goes to the developer.
      data_collection_permissions: { required: ['browsingActivity', 'websiteContent'] },
    },
    // Firefox for Android got data_collection_permissions in 142.
    gecko_android: { strict_min_version: MIN_FIREFOX_ANDROID },
  };
  return m;
}

function build() {
  const chrome = readManifest();
  const manifest = firefoxManifest(chrome);
  rmSync(OUT, { recursive: true, force: true });
  const files = extensionFiles();
  for (const rel of files) {
    if (rel === 'manifest.json') continue;
    const dst = join(OUT, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(EXT, rel), dst);
  }
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  writeFileSync(join(OUT, 'manifest.json'), manifestText);

  const zip = join(ROOT, 'release', `ghost-from-the-past-firefox-v${manifest.version}.zip`);
  writeZip(zip, files.map(name => ({ name, data: name === 'manifest.json' ? Buffer.from(manifestText) : readFileSync(join(OUT, name)) })));
  console.log(`dist/firefox: ${files.length} files`);
  console.log(`wrote ${zip.slice(ROOT.length + 1)}`);
}

build();

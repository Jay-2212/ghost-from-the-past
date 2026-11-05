// Renders extension/icons/ghost.svg to icon-{16,32,48,128}.png with headless Chromium (crisp, transparent corners).
// Usage: npm run icons   (needs `npx playwright install chromium` once)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
import { existsSync } from 'node:fs';
const full = readFileSync(join(dir, 'ghost.svg'), 'utf8');
// a hand-simplified drawing reads better at 16px
const tiny = existsSync(join(dir, 'ghost-16.svg')) ? readFileSync(join(dir, 'ghost-16.svg'), 'utf8') : full;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${(size <= 16 ? tiny : full).replace('width="128" height="128"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: join(dir, `icon-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', `icon-${size}.png`);
}
await browser.close();

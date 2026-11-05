// End-to-end test: real extension in headless Chromium -> local Worker (wrangler dev, D1 local, mock embeddings) -> MCP client.
//
//   npm install && npx playwright install chromium && (cd worker && npm install) && npm run test:e2e
//
// Env: WORKER_URL=https://...  GHOST_SECRET=...  to run against a deployed Worker instead of wrangler dev.
//      HTTPS_PROXY is honoured for Chromium (needed in some sandboxes). SHOTS=0 to skip screenshots.
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'extension');
const WORKER = join(ROOT, 'worker');
const SHOTS = join(ROOT, 'shots');
const REMOTE = process.env.WORKER_URL || '';
const PORT = 8787;
const BASE = REMOTE || `http://127.0.0.1:${PORT}`;
const PAGES = (process.env.E2E_PAGES || 'https://en.wikipedia.org/wiki/Ghost,https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API,https://github.com/mozilla/readability,https://example.com/').split(',');
const BLOCKED_PAGE = 'https://accounts.google.com/';
const results = [];
const t0 = Date.now();

function log(...a) { console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a); }
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  log(ok ? 'PASS' : 'FAIL', name, detail);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function proxyOpt() {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!p) return undefined;
  const u = new URL(p);
  return { server: `${u.protocol}//${u.hostname}:${u.port}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: '127.0.0.1,localhost' };
}

async function waitFor(fn, ms, every = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(every);
  }
  return null;
}

let wrangler;
async function startWorker(secret) {
  const state = mkdtempSync(join(tmpdir(), 'ghost-e2e-'));
  writeFileSync(join(WORKER, '.dev.vars'), `GHOST_SECRET=${secret}\n`);
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--env', 'local', '--local', '--persist-to', state], { cwd: WORKER, stdio: 'ignore', env: { ...process.env, CI: '1' } });
  wrangler = spawn('npx', ['wrangler', 'dev', '--env', 'local', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state], { cwd: WORKER, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  wrangler.stdout.on('data', () => {});
  wrangler.stderr.on('data', () => {});
  const up = await waitFor(() => fetch(`${BASE}/health`).then(r => r.ok), 60000);
  check('worker starts (wrangler dev, local D1)', up);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const userData = mkdtempSync(join(tmpdir(), 'ghost-profile-'));
  const ctx = await chromium.launchPersistentContext(userData, {
    channel: 'chromium',
    headless: true,
    proxy: proxyOpt(),
    ignoreHTTPSErrors: true,
    viewport: { width: 1200, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--ignore-certificate-errors', '--proxy-bypass-list=127.0.0.1;localhost'],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    check('extension service worker loads', !!extId, extId);
    const extUrl = p => `chrome-extension://${extId}/${p}`;

    // 1. onboarding opens by itself on install
    const onboarding = await waitFor(() => ctx.pages().find(p => p.url().startsWith(extUrl('onboarding.html'))), 15000);
    check('onboarding opens on install', !!onboarding);
    const ob = onboarding || (await ctx.newPage());
    if (!onboarding) await ob.goto(extUrl('onboarding.html'));
    await ob.setViewportSize({ width: 900, height: 760 });
    await ob.waitForSelector('#iam');
    await ob.screenshot({ path: join(SHOTS, 'onboarding-1-welcome.png') });
    await ob.click('#iam');
    await ob.waitForFunction(() => document.getElementById("secretOut").textContent.length === 64, null, { timeout: 15000 });
    const secret = REMOTE ? process.env.GHOST_SECRET : (await ob.textContent('#secretOut')).trim();
    check('extension generated a 256-bit secret', /^[0-9a-f]{64}$/.test(secret || '') || !!REMOTE);
    await ob.screenshot({ path: join(SHOTS, 'onboarding-2-cloudflare.png') });

    // 2. the "deployed" Worker uses the secret the user pasted on the Deploy page
    if (!REMOTE) await startWorker(secret);
    else check('remote worker reachable', await fetch(`${BASE}/health`).then(r => r.ok));

    // 3. landing page handshake: Connect to extension -> confirm in onboarding
    const landing = await ctx.newPage();
    await landing.setViewportSize({ width: 900, height: 820 });
    const resp = await landing.goto(`${BASE}/`);
    await landing.waitForSelector('#connect', { timeout: 15000 }).catch(async e => {
      log('landing page did not render:', resp && resp.status(), (await landing.content()).slice(0, 600));
      throw e;
    });
    await landing.screenshot({ path: join(SHOTS, 'worker-landing.png') });
    if (REMOTE) {
      // the remote secret is not the generated one: hand it over through the manual fields
      await ob.bringToFront();
      await ob.click('#manual summary');
      await ob.fill('#workerUrl', BASE);
      await ob.fill('#secretIn', secret);
      await ob.click('#connectBtn');
    } else {
      await landing.click('#connect');
      const sent = await waitFor(() => landing.evaluate(() => document.documentElement.dataset.ghostConnect), 8000);
      check('landing page hands the Worker URL to the extension', sent === 'sent', String(sent));
      await ob.bringToFront();
      await ob.waitForFunction(() => !document.getElementById('offer').hidden, null, { timeout: 10000 });
      check('onboarding asks to confirm the offered Worker', (await ob.textContent('#offerUrl')).trim() === BASE);
      await ob.screenshot({ path: join(SHOTS, 'onboarding-2b-confirm.png') });
      await ob.click('#offerYes');
    }
    await ob.waitForFunction(() => !document.getElementById('s3').hidden, null, { timeout: 20000 }).catch(() => {});
    const done = await ob.isVisible('#s3');
    check('connection test passes -> "All done! I\'ll be watching you."', done, done ? await ob.textContent('#doneInfo') : await ob.textContent('#connToast'));
    await ob.screenshot({ path: join(SHOTS, 'onboarding-3-done.png') });
    await landing.close();

    // 4. options: remember instantly for the test (min dwell 0)
    const opt = await ctx.newPage();
    await opt.setViewportSize({ width: 900, height: 1500 });
    await opt.goto(extUrl('options.html'));
    await opt.waitForFunction(() => document.getElementById('workerUrl').value.length > 0);
    await opt.fill('#minDwell', '0');
    await opt.click('#savePrivacy');
    await opt.click('#testConn');
    await opt.waitForFunction(() => /Connected/.test(document.getElementById('connToast').textContent), null, { timeout: 15000 }).catch(() => {});
    check('options: test connection', /Connected/.test(await opt.textContent('#connToast')), await opt.textContent('#connToast'));

    // 5. read some real pages (and one that must be blocked)
    const reader = await ctx.newPage();
    for (const u of [...PAGES, BLOCKED_PAGE]) {
      try {
        await reader.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await reader.bringToFront();
        await sleep(4500); // capture runs ~2.5 s after idle
        log('visited', u);
      } catch (e) {
        log('could not load', u, e.message.split('\n')[0]);
      }
    }
    await sleep(1500);
    const queued = await sw.evaluate(async () => Object.keys((await chrome.storage.local.get('queue')).queue || {}));
    check('pages captured into the local queue', PAGES.filter(u => queued.some(q => q.startsWith(u.replace(/\/$/, '')))).length >= 3, queued.join(' | '));
    check('blocklisted page (accounts.google.com) not captured', !queued.some(q => q.includes('accounts.google.com')));

    // 6. popup: screenshot + Sync now
    const pop = await ctx.newPage();
    await pop.setViewportSize({ width: 330, height: 470 });
    await pop.goto(extUrl('popup.html'));
    await pop.waitForFunction(() => !document.getElementById('main').hidden);
    await pop.screenshot({ path: join(SHOTS, 'popup-before-sync.png') });
    await pop.click('#syncBtn');
    // Wait for the button to re-enable, then check for successful sync text
    await pop.waitForFunction(() => {
      const btn = document.getElementById('syncBtn');
      const txt = document.getElementById('lastSync').textContent;
      // Match "Last sync: (just now|N min ago|N h ago|N d ago) · [1-9]N* page(s)" or "Sync problem"
      return (!btn.disabled && (/Last sync: (just now|\d+ (min|h|d) ago) · [1-9]\d* page\(s\)/.test(txt) || /Sync problem/.test(txt)));
    }, null, { timeout: 30000 });
    const syncText = await pop.textContent('#lastSync');
    check('popup "Sync now" sends the queue', /Last sync: (just now|\d+ (min|h|d) ago) · [1-9]\d* page\(s\)/.test(syncText), syncText);
    await pop.reload();
    await pop.waitForFunction(() => !document.getElementById('main').hidden);
    await pop.screenshot({ path: join(SHOTS, 'popup.png') });
    await opt.reload();
    await opt.waitForFunction(() => document.querySelectorAll('#recent li').length > 0);
    await opt.screenshot({ path: join(SHOTS, 'options.png'), fullPage: true });

    // 7. records arrived
    const stats = await fetch(`${BASE}/api/stats`, { headers: { authorization: `Bearer ${secret}` } }).then(r => r.json());
    check('records arrived in D1', stats.pages >= 3, `${stats.pages} pages, ${stats.chunks} chunks, kinds ${JSON.stringify(stats.kinds)}`);

    // 8. a real MCP client
    const client = new Client({ name: 'ghost-e2e', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${secret}` } } }));
    const tools = (await client.listTools()).tools.map(t => t.name).sort();
    check('MCP lists the tools', ['forget', 'get_page', 'list_pages', 'memory_stats', 'search_memory'].every(t => tools.includes(t)), tools.join(','));
    const s1 = await client.callTool({ name: 'search_memory', arguments: { query: 'ghost folklore apparition spirit of the dead' } });
    const top1 = (s1.structuredContent?.results || []).slice(0, 3).map(r => r.url);
    check('search_memory finds the Wikipedia ghost article', top1.some(u => u.includes('wikipedia.org/wiki/Ghost')), top1.join(' | '));
    const s2 = await client.callTool({ name: 'search_memory', arguments: { query: 'IndexedDB transactions object store', domain: 'developer.mozilla.org' } });
    const top2 = (s2.structuredContent?.results || []).map(r => `${r.url} (${r.timeSpent}, ${r.kind})`);
    check('search_memory with domain filter finds MDN', top2.length > 0 && top2[0].includes('developer.mozilla.org'), top2.join(' | '));
    const today = new Date().toISOString().slice(0, 10);
    const lp = await client.callTool({ name: 'list_pages', arguments: { date: today } });
    check('list_pages for today', (lp.structuredContent?.total || 0) >= 3, `${lp.structuredContent?.total} pages`);
    const gp = await client.callTool({ name: 'get_page', arguments: { url: 'https://en.wikipedia.org/wiki/Ghost' } });
    const gtext = gp.content?.[0]?.text || '';
    check('get_page returns full markdown', gp.structuredContent?.found && gtext.length > 2000, `${gtext.length} chars`);
    writeFileSync(join(SHOTS, 'mcp-get_page-wikipedia.md'), gtext.slice(0, 6000));
    const f0 = await client.callTool({ name: 'forget', arguments: { url: 'https://example.com/', confirm: false } });
    check('forget refuses without confirm', f0.isError === true);
    const f1 = await client.callTool({ name: 'forget', arguments: { url: 'https://example.com/', confirm: true } });
    check('forget deletes a page', f1.structuredContent?.deleted === 1, JSON.stringify(f1.structuredContent));
    const gone = await client.callTool({ name: 'get_page', arguments: { url: 'https://example.com/' } });
    check('forgotten page is gone', gone.structuredContent?.found === false);
    const ms = await client.callTool({ name: 'memory_stats', arguments: {} });
    log('memory_stats:', (ms.content?.[0]?.text || '').split('\n')[0]);
    writeFileSync(join(SHOTS, 'mcp-search-results.json'), JSON.stringify({ search1: s1.structuredContent, search2: s2.structuredContent }, null, 2));
    await client.close();

    // 9. auth is enforced
    const noAuth = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    check('MCP without the secret is rejected (401)', noAuth.status === 401);
  } finally {
    await ctx.close().catch(() => {});
    if (wrangler) wrangler.kill('SIGTERM');
    if (!REMOTE) rmSync(join(WORKER, '.dev.vars'), { force: true });
  }
}

main()
  .catch(e => check('e2e crashed', false, e.stack || String(e)))
  .finally(() => {
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    writeFileSync(join(SHOTS, 'e2e-results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
    process.exit(failed.length ? 1 : 0);
  });

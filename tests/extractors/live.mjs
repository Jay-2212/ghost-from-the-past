// Live extractor test: load real pages in headless Chromium, run pipeline, write markdown + summary.
//
//   npm install && npx playwright install chromium && node tests/extractors/live.mjs
//
// Env: HTTPS_PROXY is honoured for Chromium (needed in some sandboxes).
//      TIMEOUT_MS to override 30s default timeout per page.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'extension');
const OUT = join(ROOT, 'tests', 'extractors', 'out');
const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '30000', 10);

function log(...a) { console.log(...a); }

function proxyOpt() {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!p) return undefined;
  const u = new URL(p);
  return { server: `${u.protocol}//${u.hostname}:${u.port}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: '127.0.0.1,localhost' };
}

// Test cases: one per extractor as specified in R26
const TEST_CASES = [
  { name: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube-video', keyFields: ['title', 'channel'] },
  { name: 'reddit', url: 'https://www.reddit.com/r/AskReddit/comments/1ku5jde/', kind: 'reddit-thread', keyFields: ['title', 'author'] },
  { name: 'x', url: 'https://x.com/elonmusk/status/1', kind: 'x-post', keyFields: ['author', 'text'] },
  { name: 'github-repo', url: 'https://github.com/mozilla/readability', kind: 'github-repo', keyFields: ['description'] },
  { name: 'github-issue', url: 'https://github.com/microsoft/vscode/issues/1', kind: 'github-issue', keyFields: ['title', 'body'] },
  { name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Ghost', kind: 'wikipedia-article', keyFields: ['title'] },
  { name: 'stackoverflow', url: 'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array', kind: 'stackoverflow-question', keyFields: ['question'] },
  { name: 'amazon-product', url: 'https://www.amazon.in/dp/B08N5WRWNW', kind: 'product', keyFields: ['name', 'price'] },
  { name: 'news', url: 'https://www.bbc.com/news/world', kind: 'news-article', keyFields: ['headline'] },
  { name: 'mdn-docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API', kind: 'docs-page', keyFields: ['title'] },
];

async function loadPipelineInPage(page) {
  // Read manifest.json to get the exact content script load order
  const manifestPath = join(EXT, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const scripts = manifest.content_scripts[0].js;
  
  // Load all content scripts except content.js itself (that's the integration layer we replicate below)
  for (const scriptPath of scripts) {
    if (scriptPath === 'content.js') continue;
    await page.addScriptTag({ path: join(EXT, scriptPath) });
  }
}

async function testExtractor(browser, testCase) {
  const { name, url, kind, keyFields } = testCase;
  log(`Testing ${name}: ${url}`);
  
  const context = await browser.newContext({
    proxy: proxyOpt(),
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    viewport: { width: 1280, height: 1024 },
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate with timeout
    const response = await page.goto(url, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' }).catch(err => {
      // ERR_HTTP_RESPONSE_CODE_FAILURE or similar => blocked
      if (err.message.includes('net::ERR_') || err.message.includes('NS_ERROR_')) {
        return null; // treat as blocked
      }
      throw err;
    });
    
    // Check for blocking (403, 429, bot detection, login walls, net errors)
    if (!response || response.status() >= 400) {
      log(`  BLOCKED: HTTP ${response?.status() || 'network error'}`);
      return {
        name,
        url,
        status: 'blocked',
        reason: `HTTP ${response?.status() || 'network error'}`,
        kind: null,
        chars: 0,
        keyFields: {},
      };
    }
    
    // Load pipeline and extractors
    await loadPipelineInPage(page);
    
    // Run extraction (call GhostPipeline.run as content.js does)
    const result = await page.evaluate(async () => {
      try {
        const extracted = await globalThis.GhostPipeline.run(document, window.location.href, {});
        
        if (!extracted || !extracted.markdown || extracted.markdown.length < 120) {
          return { ok: false, error: 'Extraction failed or too short' };
        }
        
        return {
          ok: true,
          kind: extracted.kind,
          title: extracted.title,
          markdown: extracted.markdown,
          excerpt: extracted.excerpt,
          extractor: extracted.extractor,
          domain: extracted.domain,
          lang: extracted.lang,
          meta: extracted.meta || {},
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    
    if (!result.ok) {
      log(`  FAIL: ${result.error}`);
      return {
        name,
        url,
        status: 'fail',
        reason: result.error,
        kind: null,
        chars: 0,
        keyFields: {},
      };
    }
    
    // Check expected kind
    const kindMatch = result.kind === kind || (kind === 'github-repo' && result.kind?.startsWith('github-'));
    
    // Check key fields (at least some should be present)
    const foundFields = {};
    for (const field of keyFields) {
      if (result.meta?.[field]) foundFields[field] = true;
      else if (field === 'title' && result.title) foundFields[field] = true;
      else if (field === 'question' && result.markdown.includes('?')) foundFields[field] = true;
    }
    
    const fieldCount = Object.keys(foundFields).length;
    const pass = kindMatch && fieldCount > 0 && result.markdown.length >= 120;
    
    log(`  ${pass ? 'PASS' : 'FAIL'}: kind=${result.kind}, chars=${result.markdown.length}, fields=${fieldCount}/${keyFields.length}`);
    
    // Write markdown output
    writeFileSync(join(OUT, `${name}.md`), result.markdown, 'utf-8');
    
    return {
      name,
      url,
      status: pass ? 'pass' : 'fail',
      kind: result.kind,
      chars: result.markdown.length,
      keyFields: foundFields,
      title: result.title,
    };
    
  } catch (err) {
    // Timeout or other error
    if (err.message.includes('Timeout')) {
      log(`  BLOCKED: Timeout (possible bot detection)`);
      return {
        name,
        url,
        status: 'blocked',
        reason: 'Timeout',
        kind: null,
        chars: 0,
        keyFields: {},
      };
    }
    
    log(`  FAIL: ${err.message}`);
    return {
      name,
      url,
      status: 'fail',
      reason: err.message,
      kind: null,
      chars: 0,
      keyFields: {},
    };
  } finally {
    await context.close();
  }
}

async function main() {
  log('Starting live extractor tests...');
  log(`Timeout: ${TIMEOUT}ms per page`);
  
  // Create output directory
  mkdirSync(OUT, { recursive: true });
  
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  
  try {
    const results = [];
    
    for (const testCase of TEST_CASES) {
      const result = await testExtractor(browser, testCase);
      results.push(result);
    }
    
    // Write summary
    const summary = {
      timestamp: new Date().toISOString(),
      timeout_ms: TIMEOUT,
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      blocked: results.filter(r => r.status === 'blocked').length,
      results: results.map(r => ({
        name: r.name,
        url: r.url,
        status: r.status,
        kind: r.kind,
        chars: r.chars,
        keyFields: Object.keys(r.keyFields),
        reason: r.reason,
      })),
    };
    
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    
    // Console summary
    log('\n=== Summary ===');
    log(`Total: ${summary.total}`);
    log(`Passed: ${summary.passed}`);
    log(`Failed: ${summary.failed}`);
    log(`Blocked: ${summary.blocked}`);
    log(`\nResults written to ${OUT}/`);
    
    // Exit with error if any tests failed (but not if blocked)
    if (summary.failed > 0) {
      process.exit(1);
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

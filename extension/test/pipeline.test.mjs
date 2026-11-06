import { test } from 'node:test';
import assert from 'node:assert/strict';
import h from './helpers.cjs';
const { P, run, lorem } = h;

test('all extractors are registered in order', () => {
  assert.deepEqual(P.list(), ['youtube', 'reddit', 'x', 'github', 'wikipedia', 'stackexchange', 'product', 'docs', 'news']);
});

test('generic: article survives, nav/cookie/footer/ads removed, markdown structure kept', async () => {
  const html = `<html lang="en"><head><title>Haunted Houses Explained</title></head><body>
    <nav><a href="/">Home</a><a href="/about">About us navigation link</a></nav>
    <div id="cookie-banner">We use cookies to improve your experience. Accept all</div>
    <div class="ad-slot">BUY CHEAP SPOOKY MASKS NOW advertisement</div>
    <main><article><h1>Haunted Houses Explained</h1><p>${lorem(8)}</p><h2>Why floors creak</h2><p>${lorem(6)}</p>
    <pre><code class="language-js">const ghost = "boo";</code></pre><p>See <a href="https://example.com/x">the source</a>.</p>
    <p>${lorem(4)}</p><p>${lorem(4)}</p></article></main>
    <footer>Copyright footer text with many words that should vanish</footer></body></html>`;
  const r = await run(html, 'https://blog.example.com/haunted');
  assert.equal(r.kind, 'article');
  assert.equal(r.extractor, 'generic');
  assert.match(r.markdown, /^# Haunted Houses Explained\n\n> Article · blog\.example\.com/);
  assert.match(r.markdown, /## Why floors creak/);
  assert.match(r.markdown, /```js\nconst ghost = "boo";\n```/);
  assert.match(r.markdown, /\[the source\]\(https:\/\/example\.com\/x\)/);
  assert.doesNotMatch(r.markdown, /cookies|SPOOKY MASKS|Copyright footer|About us navigation/);
  assert.equal(r.lang, 'en');
});

test('post-process dedupes repeated paragraphs and drops boilerplate lines', () => {
  const para = 'This exact paragraph about a lantern is repeated twice on the page.';
  const out = P.postProcess(`${para}\n\nShare this article\n\n${para}\n\nSubscribe\n\nUnique closing words here.`, { kind: 'article', title: 'T', url: 'https://a.b/', domain: 'a.b', meta: {} });
  assert.equal(out.split(para).length - 1, 1);
  assert.doesNotMatch(out, /Share this article|Subscribe/);
  assert.match(out, /Unique closing words/);
});

test('caps markdown size', () => {
  const out = P.postProcess('word '.repeat(60000), { kind: 'article', title: 'T', url: 'u', domain: 'd', meta: {} });
  assert.ok(out.length <= P.MAX_MARKDOWN + 20);
  assert.match(out, /truncated\]$/);
});

test('skips login pages and tiny pages', async () => {
  const login = await run('<html><body><h1>Sign in</h1><form><input name=u><input type="password" name=p></form></body></html>', 'https://news.example.com/x');
  assert.equal(login.skip, 'login-form');
  const tiny = await run('<html><body><p>hi</p></body></html>', 'https://example.com/');
  assert.equal(tiny.skip, 'too-short');
});

test('youtube: title, channel, description from ytInitialPlayerResponse; id mismatch falls back to DOM', async () => {
  const pr = { videoDetails: { videoId: 'abc123', title: 'How ghosts work', author: 'Spooky Science', shortDescription: lorem(3), lengthSeconds: '600' }, microformat: { playerMicroformatRenderer: { publishDate: '2024-10-31' } } };
  const html = `<html><head><title>x</title></head><body><script>var ytInitialPlayerResponse = ${JSON.stringify(pr)};var other = 1;</script></body></html>`;
  const r = await run(html, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(r.kind, 'youtube-video');
  assert.equal(r.title, 'How ghosts work');
  assert.equal(r.meta.channel, 'Spooky Science');
  assert.equal(r.meta.published, '2024-10-31');
  assert.match(r.markdown, /## Description/);
  const r2 = await run(html.replace('<body>', `<body><h1 class="ytd-watch-metadata">Other video</h1><ytd-channel-name><a>Chan</a></ytd-channel-name><div id="description-inline-expander">${lorem(3)}</div>`), 'https://www.youtube.com/watch?v=zzz');
  assert.equal(r2.title, 'Other video');
});

test('youtube: transcript flattened with timestamps when captions answer', async () => {
  const pr = { videoDetails: { videoId: 'v1', title: 'T', author: 'A', shortDescription: 'short desc here' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=v1', languageCode: 'en' }] } } };
  const events = Array.from({ length: 10 }, (_, i) => ({ tStartMs: i * 10000, segs: [{ utf8: `line ${i} of the spooky transcript text` }] }));
  const fetch = async () => ({ ok: true, text: async () => JSON.stringify({ events }) });
  const r = await run(`<html><body><script>ytInitialPlayerResponse = ${JSON.stringify(pr)};</script></body></html>`, 'https://www.youtube.com/watch?v=v1', { fetch });
  assert.match(r.markdown, /## Transcript/);
  assert.match(r.markdown, /\[00:00\] line 0/);
  assert.match(r.markdown, /\[00:30\]|\[00:40\]/);
  assert.equal(r.meta.transcript, 'yes');
});

test('youtube: transcript rejects evil baseUrl on another host', async () => {
  const pr = { videoDetails: { videoId: 'v1', title: 'T', author: 'A', shortDescription: 'short desc here' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://evil.example/api/timedtext?x', languageCode: 'en' }] } } };
  const fetchSpy = { called: false, fn: async () => { fetchSpy.called = true; return { ok: true, text: async () => '{}' }; } };
  const r = await run(`<html><body><script>ytInitialPlayerResponse = ${JSON.stringify(pr)};</script></body></html>`, 'https://www.youtube.com/watch?v=v1', { fetch: fetchSpy.fn });
  assert.equal(fetchSpy.called, false, 'fetch should not be called for evil baseUrl');
  if (r && r.meta) {
    assert.equal(r.meta.transcript, 'no');
  }
});

test('reddit: JSON path gives post + top comments, skips AutoModerator and deleted', async () => {
  const c = (author, body, score) => ({ kind: 't1', data: { author, body, score, replies: '' } });
  const data = [
    { data: { children: [{ data: { title: 'Is my house haunted?', author: 'op', subreddit: 'Paranormal', score: 42, num_comments: 3, selftext: lorem(2), permalink: '/r/Paranormal/comments/abc/x/', url: 'https://www.reddit.com/r/Paranormal/comments/abc/x/', created_utc: 1700000000 } }] } },
    { data: { children: [c('AutoModerator', 'rules', 1), c('skeptic', 'It is the pipes, always the pipes.', 99), c('ghost', '[deleted]', 5)] } },
  ];
  const fetch = async () => ({ ok: true, json: async () => data });
  const r = await run('<html><body></body></html>', 'https://www.reddit.com/r/Paranormal/comments/abc/x/', { fetch, noNetwork: false });
  assert.equal(r.kind, 'reddit-thread');
  assert.equal(r.title, 'Is my house haunted?');
  assert.match(r.markdown, /u\/skeptic\*\* \(99\): It is the pipes/);
  assert.doesNotMatch(r.markdown, /AutoModerator|\[deleted\]/);
  assert.equal(r.meta.subreddit, 'r/Paranormal');
});

test('x: main post and replies', async () => {
  const tw = (u, t) => `<article data-testid="tweet"><div data-testid="User-Name">${u}·1h</div><time datetime="2026-11-01T10:00:00.000Z"></time><div data-testid="tweetText">${t}</div></article>`;
  const r = await run(`<html><body>${tw('Kiro @kirodotdev', 'Kiroween is here. Build something spooky with specs, hooks and steering this month!')}${tw('Jay @jay', 'Building a ghost that remembers every page I read.')}</body></html>`, 'https://x.com/kirodotdev/status/123');
  assert.equal(r.kind, 'x-post');
  assert.match(r.title, /^Kiro @kirodotdev: Kiroween is here/);
  assert.match(r.markdown, /## Thread and replies/);
  assert.equal(r.meta.published, '2026-11-01T10:00:00.000Z');
});

test('github: repo README and issue comments', async () => {
  const repo = await run(`<html><body><p class="f4 my-3">A ghost that remembers what you read</p><a class="topic-tag">mcp</a><span id="repo-stars-counter-star">1.2k</span><article class="markdown-body"><h1>ghost</h1><p>${lorem(4)}</p></article></body></html>`, 'https://github.com/Jay-2212/ghost-from-the-past');
  assert.equal(repo.kind, 'github-repo');
  assert.match(repo.markdown, /## README/);
  assert.equal(repo.meta.stars, '1.2k');
  const issue = await run(`<html><body><bdi class="js-issue-title">Sync fails offline</bdi><span class="State">Open</span><div class="comment-body"><p>${lorem(2)}</p></div><div class="comment-body"><p>Fixed in main by retrying next alarm.</p></div></body></html>`, 'https://github.com/a/b/issues/7');
  assert.equal(issue.kind, 'github-issue');
  assert.match(issue.title, /Sync fails offline · a\/b#7/);
  assert.match(issue.markdown, /### Comment/);
  assert.equal((await run('<html><body><p>x</p></body></html>', 'https://github.com/settings/profile')).extractor ?? 'generic', 'generic');
});

test('wikipedia: drops references and everything after References, keeps infobox', async () => {
  const html = `<html lang="en"><body><h1 id="firstHeading">Ghost</h1><div id="mw-content-text"><div class="mw-parser-output">
    <table class="infobox"><tr><th>Grouping</th><td>Spirit</td></tr></table>
    <p>In folklore, a ghost is the soul of a dead person.<sup class="reference">[1]</sup> ${lorem(3)}</p>
    <div class="mw-heading"><h2>Terminology</h2></div><p>${lorem(2)}</p>
    <div class="mw-heading"><h2>References</h2></div><ol class="references"><li>Some citation text</li></ol>
    <div class="navbox">Navbox junk</div></div></div></body></html>`;
  const r = await run(html, 'https://en.wikipedia.org/wiki/Ghost');
  assert.equal(r.kind, 'wikipedia-article');
  assert.match(r.markdown, /\*\*Grouping\*\*: Spirit/);
  assert.match(r.markdown, /## Terminology/);
  assert.doesNotMatch(r.markdown, /\[1\]|Some citation|Navbox junk|## References/);
});

test('stackexchange: accepted answer first, then by score', async () => {
  const ans = (cls, score, text) => `<div class="answer ${cls}"><div class="js-vote-count" data-value="${score}">${score}</div><div class="s-prose"><p>${text}</p></div></div>`;
  const html = `<html><body><div id="question-header"><h1>How do I exorcise a memory leak?</h1></div><div id="question" class="question"><div class="js-vote-count" data-value="12">12</div><div class="s-prose"><p>${lorem(2)}</p></div><a class="post-tag">javascript</a></div>
    ${ans('', 50, 'Top voted but not accepted answer text.')}${ans('accepted-answer', 7, 'Accepted answer: remove the event listeners.')}${ans('', 3, 'Low answer.')}</body></html>`;
  const r = await run(html, 'https://stackoverflow.com/questions/1/how');
  assert.equal(r.kind, 'stackoverflow-question');
  const iAcc = r.markdown.indexOf('Accepted answer (score 7)');
  const iTop = r.markdown.indexOf('Top voted but not accepted');
  assert.ok(iAcc > 0 && iTop > iAcc);
  assert.equal(r.meta.tags, 'javascript');
});

test('product: amazon DOM and JSON-LD fallback', async () => {
  const amz = await run(`<html><body><span id="productTitle">Spooky Lantern 3000</span><div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">₹1,299</span></span></div>
    <div id="feature-bullets"><ul><li><span class="a-list-item">Warm LED glow for haunted evenings</span></li><li><span class="a-list-item">Battery lasts 40 hours</span></li></ul></div>
    <table id="productDetails_techSpec_section_1"><tr><th>Weight</th><td>300 g</td></tr></table></body></html>`, 'https://www.amazon.in/Spooky-Lantern/dp/B000TEST');
  assert.equal(amz.kind, 'product');
  assert.equal(amz.meta.price, '₹1,299');
  assert.match(amz.markdown, /\*\*Weight\*\*: 300 g/);
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: 'Ghost Plush', description: 'A soft ghost plush toy for spooky cuddles all year.', offers: { '@type': 'Offer', price: '19.99', priceCurrency: 'USD' }, brand: { name: 'Boo Co' } };
  const shop = await run(`<html><body><h1>Ghost Plush</h1><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`, 'https://shop.example.com/ghost-plush');
  assert.equal(shop.kind, 'product');
  assert.match(shop.markdown, /USD 19\.99/);
  assert.equal(shop.meta.brand, 'Boo Co');
});

test('docs: keeps code, drops sidebar and feedback', async () => {
  const r = await run(`<html><body><aside>Sidebar nav entries</aside><main><article><h1>IndexedDB API</h1><p>${lorem(3)}</p><pre class="brush: js">indexedDB.open("ghosts")</pre><div class="feedback">Was this page helpful?</div></article></main></body></html>`, 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API');
  assert.equal(r.kind, 'docs-page');
  assert.match(r.markdown, /```js\nindexedDB\.open\("ghosts"\)\n```/);
  assert.doesNotMatch(r.markdown, /Sidebar nav|helpful/);
});

test('news: NewsArticle JSON-LD adds author/date/section', async () => {
  const ld = { '@type': 'NewsArticle', headline: 'Ghost sightings up 300%', author: [{ name: 'A. Reporter' }], datePublished: '2026-10-31T09:00:00Z', articleSection: 'Weird' };
  const r = await run(`<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><article><h1>Ghost sightings up 300%</h1><p>${lorem(8)}</p><p>${lorem(5)}</p></article></body></html>`, 'https://news.example.com/2026/ghosts');
  assert.equal(r.kind, 'news-article');
  assert.equal(r.meta.author, 'A. Reporter');
  assert.equal(r.meta.section, 'Weird');
  assert.match(r.markdown, /> News article · news\.example\.com · A\. Reporter · 2026-10-31/);
});

test('github: og:description fallback with boilerplate stripping', async () => {
  // GitHub repo with description only in og:description meta tag
  const html = `<html><head>
    <meta property="og:description" content="GitHub - mozilla/readability: A standalone version of the readability lib - mozilla/readability">
    <meta name="description" content="A standalone version of the readability lib. Contribute to mozilla/readability development by creating an account on GitHub.">
    </head><body>
    <article class="markdown-body"><h1>Readability.js</h1><p>${lorem(4)}</p></article>
    </body></html>`;
  const r = await run(html, 'https://github.com/mozilla/readability');
  assert.equal(r.kind, 'github-repo');
  assert.match(r.markdown, /^.*mozilla\/readability/);
  // Check that description was extracted and stripped
  assert.match(r.markdown, /A standalone version of the readability lib/);
  assert.doesNotMatch(r.markdown, /GitHub - mozilla\/readability:/);
  assert.doesNotMatch(r.markdown, /Contribute to .+ development by creating an account/);
  // Check meta.description is present and capped
  assert.ok(r.meta.description);
  assert.match(r.meta.description, /A standalone version of the readability lib/);
  assert.ok(r.meta.description.length <= 300);
  
  // Test suffix regex: description with " - " in it should not be eaten
  const html2 = `<html><head>
    <meta property="og:description" content="GitHub - user/repo: This is a real - description with dashes/slashes - user/repo">
    </head><body><article class="markdown-body"><h1>README</h1><p>${lorem(4)}</p></article></body></html>`;
  const r2 = await run(html2, 'https://github.com/user/repo');
  assert.ok(r2.meta?.description);
  assert.match(r2.meta.description, /This is a real - description with dashes\/slashes/);
  assert.doesNotMatch(r2.meta.description, /user\/repo/);
  
  // Test boilerplate-only description (no leading ". ")
  const html3 = `<html><head>
    <meta name="description" content="Contribute to user/repo development by creating an account on GitHub.">
    </head><body><article class="markdown-body"><h1>README</h1><p>${lorem(4)}</p></article></body></html>`;
  const r3 = await run(html3, 'https://github.com/user/repo');
  assert.equal(r3.meta?.description, undefined, 'Boilerplate-only description should be empty');
});

test('news: section pages rejected, real articles matched', async () => {
  // BBC section page should NOT match news extractor
  const sectionLd = { '@type': 'CollectionPage', name: 'World' };
  const section = await run(
    `<html><head><script type="application/ld+json">${JSON.stringify(sectionLd)}</script></head>
    <body><h1>World News</h1><div>${lorem(3)}</div></body></html>`,
    'https://www.bbc.com/news/world'
  );
  assert.notEqual(section.kind, 'news-article', 'Section page should not be news-article');
  
  // BBC article with NewsArticle JSON-LD SHOULD match
  const articleLd = { '@type': 'NewsArticle', headline: 'Breaking news story', datePublished: '2026-11-01' };
  const article = await run(
    `<html><head>
    <meta property="og:type" content="article">
    <meta property="article:published_time" content="2026-11-01T10:00:00Z">
    <script type="application/ld+json">${JSON.stringify(articleLd)}</script>
    </head><body><article><h1>Breaking news story</h1><p>${lorem(8)}</p></article></body></html>`,
    'https://www.bbc.com/news/articles/abc123'
  );
  assert.equal(article.kind, 'news-article', 'Real article should be news-article');
  
  // Generic /news/business path should be rejected
  const genericSection = await run(
    `<html><body><h1>Business News</h1><div>${lorem(3)}</div></body></html>`,
    'https://example.com/news/business'
  );
  assert.notEqual(genericSection.kind, 'news-article', 'Generic section path should not be news-article');
});

/* Ghost from the Past — extraction pipeline. UMD: globalThis.GhostPipeline (browser) / module.exports (Node tests).
 *
 *   guard -> pick extractor -> extract -> (fallback to generic) -> post-process -> {kind,title,markdown,excerpt,lang,meta}
 *
 * Site extractors live in lib/extractors/*.js and call GhostPipeline.register({name, match(url, doc), extract(doc, url, ctx)}).
 * extract() may be async (YouTube transcript, Reddit JSON) and returns {kind, title, markdown, meta?, excerpt?} or null.
 * Readability and TurndownService come from vendor/ (globals) in the browser, or from ctx / require() in Node.
 */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.GhostPipeline = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MAX_MARKDOWN = 200000;
  var MIN_CHARS = 120;
  var extractors = [];

  var KIND_LABEL = {
    'youtube-video': 'YouTube video', 'reddit-thread': 'Reddit thread', 'x-post': 'X post', 'github-repo': 'GitHub repository',
    'github-issue': 'GitHub issue', 'github-pr': 'GitHub pull request', 'github-page': 'GitHub', 'wikipedia-article': 'Wikipedia article',
    'stackoverflow-question': 'Q&A', product: 'Product', 'news-article': 'News article', 'docs-page': 'Documentation', article: 'Article',
  };

  // ---------- helpers shared with extractors ----------
  function txt(el) {
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function $(root, sel) {
    try { return root.querySelector(sel); } catch (e) { return null; }
  }
  function $$(root, sel) {
    try { return Array.prototype.slice.call(root.querySelectorAll(sel)); } catch (e) { return []; }
  }
  function first(root, sels) {
    for (var i = 0; i < sels.length; i++) {
      var el = $(root, sels[i]);
      if (el && txt(el)) return el;
    }
    return null;
  }
  function metaContent(doc, key) {
    var el = $(doc, 'meta[property="' + key + '"]') || $(doc, 'meta[name="' + key + '"]') || $(doc, 'meta[itemprop="' + key + '"]');
    return el ? String(el.getAttribute('content') || '').trim() : '';
  }
  function cap(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s;
  }
  function jsonLd(doc) {
    var out = [];
    $$(doc, 'script[type="application/ld+json"]').forEach(function (s) {
      try {
        var data = JSON.parse(s.textContent || 'null');
        (function walk(d) {
          if (!d) return;
          if (Array.isArray(d)) return d.forEach(walk);
          if (typeof d === 'object') {
            out.push(d);
            if (d['@graph']) walk(d['@graph']);
          }
        })(data);
      } catch (e) { /* ignore broken JSON-LD */ }
    });
    return out;
  }
  function ldTypes(o) {
    var t = o && o['@type'];
    return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
  }
  function findLd(doc, types) {
    var all = jsonLd(doc);
    for (var i = 0; i < all.length; i++) {
      var ts = ldTypes(all[i]);
      for (var j = 0; j < ts.length; j++) if (types.indexOf(ts[j]) !== -1) return all[i];
    }
    return null;
  }
  function ldName(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(ldName).filter(Boolean).join(', ');
    return v.name || '';
  }
  /** Find `name = {...}` in inline scripts and return the parsed object (brace-matched, string-aware). */
  function scriptJson(doc, name) {
    var scripts = $$(doc, 'script:not([src])');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].textContent || '';
      var at = s.indexOf(name);
      if (at === -1) continue;
      var start = s.indexOf('{', at);
      if (start === -1) continue;
      var depth = 0, inStr = false, esc = false, q = '';
      for (var k = start; k < s.length; k++) {
        var c = s[k];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === q) inStr = false;
          continue;
        }
        if (c === '"' || c === "'") { inStr = true; q = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(s.slice(start, k + 1)); } catch (e) { break; }
          }
        }
      }
    }
    return null;
  }

  function getReadability(ctx) {
    if (ctx && ctx.Readability) return ctx.Readability;
    if (root.Readability) return root.Readability;
    if (typeof require === 'function') { try { return require('@mozilla/readability').Readability; } catch (e) { /* none */ } }
    return null;
  }
  function getTurndown(ctx) {
    if (ctx && ctx.TurndownService) return ctx.TurndownService;
    if (root.TurndownService) return root.TurndownService;
    if (typeof require === 'function') { try { return require('turndown'); } catch (e) { /* none */ } }
    return null;
  }

  var tdCache = null;
  function turndown(ctx) {
    if (tdCache) return tdCache;
    var TD = getTurndown(ctx);
    if (!TD) throw new Error('TurndownService not available');
    var td = new TD({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '_', hr: '---' });
    td.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'button', 'form', 'input', 'select', 'textarea', 'template', 'object', 'embed', 'video', 'audio']);
    td.addRule('ghostImages', {
      filter: 'img',
      replacement: function (content, node) {
        var alt = String(node.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
        return alt && alt.length > 2 ? '[image: ' + alt.slice(0, 160) + ']' : '';
      },
    });
    td.addRule('ghostFencedLang', {
      filter: function (node) {
        return node.nodeName === 'PRE';
      },
      replacement: function (content, node) {
        var code = node.querySelector ? node.querySelector('code') : null;
        var cls = ((code && code.getAttribute('class')) || node.getAttribute('class') || '') + ' ' + (node.getAttribute('data-language') || '');
        var m = cls.match(/(?:language|lang|highlight-source)-([\w+#-]+)/i) || cls.match(/\b(js|ts|javascript|typescript|python|bash|shell|json|html|css|go|rust|java|sql|yaml)\b/i);
        var body = String((code || node).textContent || '').replace(/\n+$/, '');
        var fence = body.indexOf('```') !== -1 ? '~~~' : '```';
        return '\n\n' + fence + (m ? m[1].toLowerCase() : '') + '\n' + body + '\n' + fence + '\n\n';
      },
    });
    td.addRule('ghostEmptyLinks', {
      filter: function (node) {
        return node.nodeName === 'A' && !String(node.textContent || '').trim();
      },
      replacement: function () { return ''; },
    });
    tdCache = td;
    return td;
  }
  function md(htmlOrEl, ctx) {
    if (!htmlOrEl) return '';
    var html = typeof htmlOrEl === 'string' ? htmlOrEl : htmlOrEl.outerHTML || '';
    try {
      return turndown(ctx).turndown(html);
    } catch (e) {
      return typeof htmlOrEl === 'string' ? htmlOrEl.replace(/<[^>]+>/g, ' ') : txt(htmlOrEl);
    }
  }

  // ---------- noise stripping + generic Readability path ----------
  var NOISE_SELECTORS = [
    'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'canvas', 'form', 'nav', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="dialog"]', '[aria-modal="true"]', '[aria-hidden="true"]',
    '[hidden]', '.sr-only', '.visually-hidden',
  ];
  var NOISE_ATTR_RE = /(^|[\s_-])(cookie|consent|gdpr|cmp|banner|newsletter|subscribe|subscription|paywall|popup|modal|overlay|advert|ads?|adslot|ad-slot|sponsor|promo|promoted|social-share|share-bar|sharing|related-posts|recommended|outbrain|taboola|breadcrumbs?|skip-link|comments?-section)([\s_-]|$)/i;

  function stripNoise(rootEl) {
    NOISE_SELECTORS.forEach(function (sel) {
      $$(rootEl, sel).forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    });
    $$(rootEl, 'header').forEach(function (el) {
      // keep article headers (they often hold the title), drop page headers
      if (!el.closest || !el.closest('article, main')) el.parentNode && el.parentNode.removeChild(el);
    });
    $$(rootEl, '[id], [class]').forEach(function (el) {
      if (el.tagName === 'BODY' || el.tagName === 'HTML' || el.tagName === 'MAIN' || el.tagName === 'ARTICLE') return;
      var key = (el.getAttribute('id') || '') + ' ' + (el.getAttribute('class') || '');
      if (key.length < 300 && NOISE_ATTR_RE.test(key) && el.parentNode) el.parentNode.removeChild(el);
    });
    return rootEl;
  }

  function generic(doc, url, ctx) {
    var R = getReadability(ctx);
    var clone = doc.cloneNode(true);
    stripNoise(clone);
    var art = null;
    if (R) {
      try { art = new R(clone, { charThreshold: 300, keepClasses: false }).parse(); } catch (e) { art = null; }
    }
    var title = '', markdown = '', excerpt = '', byline = '', published = '';
    if (art && art.textContent && art.textContent.trim().length >= 200) {
      title = art.title || '';
      markdown = md(art.content, ctx);
      excerpt = art.excerpt || '';
      byline = art.byline || '';
      published = art.publishedTime || '';
    } else {
      var fresh = stripNoise(doc.cloneNode(true));
      var main = first(fresh, ['main', 'article', '[role="main"]', '#content', '.content']) || fresh.body || fresh.documentElement;
      markdown = main ? md(main, ctx) : '';
      if (markdown.replace(/\s+/g, '').length < 60 && main) markdown = txt(main);
    }
    var ld = findLd(doc, ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'Report', 'ScholarlyArticle']);
    var meta = {};
    var author = byline || (ld && ldName(ld.author)) || metaContent(doc, 'author') || metaContent(doc, 'article:author');
    if (author && !/^https?:/.test(author)) meta.author = cap(author, 120);
    published = published || (ld && ld.datePublished) || metaContent(doc, 'article:published_time') || '';
    if (published) meta.published = String(published).slice(0, 40);
    var site = metaContent(doc, 'og:site_name');
    if (site) meta.site = cap(site, 80);
    return { kind: 'article', title: title, markdown: markdown, excerpt: excerpt, meta: meta };
  }

  // ---------- post-processing ----------
  var BOILERPLATE_RE = /^(?:[-*>#\s]*)(accept( all)?( cookies)?|reject all|manage (cookie|privacy) (settings|preferences)|we use cookies.*|this (site|website) uses cookies.*|cookie (policy|settings|preferences)|sign in|log in|sign up|register|subscribe( now)?|subscribe to (our|the) newsletter.*|share( this( article| post)?)?|share on (facebook|twitter|x|linkedin|whatsapp)|tweet|advertisement|sponsored( content)?|skip to (main )?content|back to top|related (articles|posts|stories)|recommended( for you)?|read more|load more|show more|loading\.{0,3}|you might also like|follow us.*|download (the|our) app.*|was this (page|article) helpful\??|(yes|no)|print|email|copy link|open in app)\s*$/i;

  function normKey(s) {
    return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  }

  function postProcess(raw, info) {
    var text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+$/gm, '');
    // remove empty links / data: images that survived conversion
    text = text.replace(/!\[[^\]]*\]\(data:[^)]*\)/g, '').replace(/\[\s*\]\([^)]*\)/g, '');
    var lines = text.split('\n');
    var out = [];
    var inFence = false;
    var seen = Object.create(null);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; out.push(line); continue; }
      if (inFence) { out.push(line); continue; }
      var t = line.trim();
      if (t && t.length < 90 && BOILERPLATE_RE.test(t)) continue;
      // dedupe repeated paragraphs/lines (ignore short ones, table rows, list bullets that are legitimately repeated)
      var key = normKey(t);
      if (key.length >= 24 && !/^\|/.test(t)) {
        if (seen[key]) continue;
        seen[key] = 1;
      }
      out.push(line);
    }
    text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    // drop a leading H1 that repeats the title (we add our own header)
    var title = String((info && info.title) || '').trim();
    var h1 = text.match(/^#\s+(.+)\n?/);
    if (h1 && title && normKey(h1[1]) === normKey(title)) text = text.slice(h1[0].length).trim();
    var parts = [KIND_LABEL[info.kind] || 'Page', info.domain];
    var m = info.meta || {};
    if (m.channel) parts.push(m.channel);
    else if (m.author) parts.push(m.author);
    if (m.published) parts.push(String(m.published).slice(0, 10));
    if (m.price) parts.push((m.currency ? m.currency + ' ' : '') + m.price);
    var header = '# ' + (title || info.url) + '\n\n> ' + parts.filter(Boolean).join(' · ') + '\n\n';
    var full = header + text;
    if (full.length > MAX_MARKDOWN) full = full.slice(0, MAX_MARKDOWN).replace(/\n[^\n]*$/, '') + '\n\n[…truncated]';
    return full;
  }

  function isLoginPage(doc) {
    var pw = $$(doc, 'input[type="password"]').filter(function (el) {
      return !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.type === 'password';
    });
    if (!pw.length) return false;
    var words = txt(doc.body).split(' ').length;
    return words < 300;
  }

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function register(ex) {
    if (!ex || !ex.name || typeof ex.match !== 'function' || typeof ex.extract !== 'function') throw new Error('bad extractor');
    extractors = extractors.filter(function (e) { return e.name !== ex.name; });
    extractors.push(ex);
    extractors.sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  }

  /** Main entry. Resolves to a page object or {skip: reason}. */
  async function run(doc, url, ctx) {
    ctx = ctx || {};
    if (!/^https?:/i.test(url)) return { skip: 'not-web' };
    if (isLoginPage(doc)) return { skip: 'login-form' };
    var picked = null;
    for (var i = 0; i < extractors.length; i++) {
      try { if (extractors[i].match(url, doc)) { picked = extractors[i]; break; } } catch (e) { /* ignore */ }
    }
    var res = null, used = 'generic';
    if (picked) {
      try {
        res = await picked.extract(doc, url, ctx);
        used = picked.name;
      } catch (e) {
        res = null;
        if (ctx.debug) ctx.debug('extractor ' + picked.name + ' failed: ' + (e && e.message));
      }
      if (!res || !res.markdown || res.markdown.replace(/\s+/g, ' ').trim().length < MIN_CHARS) {
        if (ctx.debug) ctx.debug('extractor ' + picked.name + ' too short, falling back to generic');
        res = null;
        used = 'generic';
      }
    }
    if (!res) res = generic(doc, url, ctx);
    var title = String(res.title || metaContent(doc, 'og:title') || doc.title || '').replace(/\s+/g, ' ').trim();
    var plain = String(res.markdown || '').replace(/\s+/g, ' ').trim();
    if (plain.length < MIN_CHARS) return { skip: 'too-short', extractor: used };
    var domain = domainOf(url);
    var kind = res.kind || 'article';
    var meta = res.meta || {};
    var markdown = postProcess(res.markdown, { kind: kind, title: title, url: url, domain: domain, meta: meta });
    var excerpt = String(res.excerpt || metaContent(doc, 'description') || metaContent(doc, 'og:description') || '').replace(/\s+/g, ' ').trim();
    if (!excerpt) excerpt = plain.slice(0, 200);
    return {
      kind: kind,
      extractor: used,
      title: cap(title, 300),
      markdown: markdown,
      excerpt: cap(excerpt, 300),
      lang: String((doc.documentElement && doc.documentElement.getAttribute('lang')) || '').slice(0, 20),
      domain: domain,
      meta: meta,
    };
  }

  return {
    register: register,
    run: run,
    generic: generic,
    postProcess: postProcess,
    stripNoise: stripNoise,
    list: function () { return extractors.map(function (e) { return e.name; }); },
    MAX_MARKDOWN: MAX_MARKDOWN,
    h: { txt: txt, $: $, $$: $$, first: first, metaContent: metaContent, cap: cap, jsonLd: jsonLd, findLd: findLd, ldTypes: ldTypes, ldName: ldName, scriptJson: scriptJson, md: md, stripNoise: stripNoise, domainOf: domainOf },
  };
});

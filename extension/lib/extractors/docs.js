/* Documentation pages: main content with code blocks, breadcrumbs as section, no sidebars/TOC/feedback widgets. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  var HOSTS = /(^|\.)(developer\.mozilla\.org|readthedocs\.io|learn\.microsoft\.com|developers\.cloudflare\.com|docs\.github\.com|nodejs\.org|docs\.python\.org|kiro\.dev|developer\.chrome\.com|developer\.apple\.com|docs\.aws\.amazon\.com|cloud\.google\.com|react\.dev|vuejs\.org|svelte\.dev|nextjs\.org|tailwindcss\.com|typescriptlang\.org|go\.dev|doc\.rust-lang\.org|docs\.rs|kubernetes\.io|docs\.docker\.com|platform\.openai\.com|docs\.anthropic\.com|modelcontextprotocol\.io|pkg\.go\.dev)$/;
  P.register({
    name: 'docs',
    order: 80,
    match: function (url, doc) {
      var u = new URL(url);
      if (HOSTS.test(u.hostname) || /^docs?\./.test(u.hostname) || /^developers?\./.test(u.hostname) || /\/(docs|documentation|api|reference|manual|guide)(\/|$)/.test(u.pathname) && doc && h.$$(doc, 'pre').length >= 2) {
        return !!(doc && h.first(doc, ['main', 'article', '[role="main"]']));
      }
      return false;
    },
    extract: function (doc, url) {
      var main = h.first(doc, ['main article', 'article', '[role="main"]', 'main']);
      if (!main) return null;
      var c = main.cloneNode(true);
      h.$$(c, 'nav, aside, .sidebar, [class*="sidebar"], [class*="toc"], [id*="toc"], .breadcrumbs, [class*="breadcrumb"], [class*="feedback"], [class*="helpful"], [class*="edit-this"], [class*="edit-page"], .prev-next, [class*="pagination"], footer, button, .copy, [class*="copy-button"], script, style').forEach(function (el) {
        el.parentNode && el.parentNode.removeChild(el);
      });
      var crumbs = h.$$(doc, 'nav[aria-label*="readcrumb"] a, .breadcrumbs a, [class*="breadcrumb"] a').map(h.txt).filter(Boolean).slice(0, 6);
      var title = h.txt(h.first(main, ['h1'])) || h.txt(h.first(doc, ['h1'])) || doc.title;
      return { kind: 'docs-page', title: title, markdown: h.md(c), excerpt: h.metaContent(doc, 'description'), meta: { section: crumbs.join(' › ') || undefined, site: h.metaContent(doc, 'og:site_name') || undefined } };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

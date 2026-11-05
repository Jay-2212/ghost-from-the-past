/* News articles (JSON-LD NewsArticle family or og:type=article with a publish time): Readability body + byline metadata. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  var NEWS = ['NewsArticle', 'ReportageNewsArticle', 'AnalysisNewsArticle', 'OpinionNewsArticle', 'ReviewNewsArticle', 'BackgroundNewsArticle', 'LiveBlogPosting'];
  P.register({
    name: 'news',
    order: 90,
    match: function (url, doc) {
      if (!doc) return false;
      if (h.findLd(doc, NEWS)) return true;
      return h.metaContent(doc, 'og:type') === 'article' && !!h.metaContent(doc, 'article:published_time') && !!h.metaContent(doc, 'article:section');
    },
    extract: function (doc, url, ctx) {
      var g = P.generic(doc, url, ctx);
      var ld = h.findLd(doc, NEWS) || {};
      var meta = g.meta || {};
      var author = h.ldName(ld.author);
      if (author) meta.author = h.cap(author, 120);
      if (ld.datePublished) meta.published = String(ld.datePublished).slice(0, 40);
      var section = ld.articleSection || h.metaContent(doc, 'article:section');
      if (section) meta.section = h.cap(Array.isArray(section) ? section.join(', ') : section, 80);
      var publisher = h.ldName(ld.publisher) || h.metaContent(doc, 'og:site_name');
      if (publisher) meta.site = h.cap(publisher, 80);
      return { kind: 'news-article', title: ld.headline || g.title, markdown: g.markdown, excerpt: g.excerpt || ld.description, meta: meta };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

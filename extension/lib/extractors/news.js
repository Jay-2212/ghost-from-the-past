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
      
      // Reject obvious section/index paths (BBC-style: /news/world, /news/business without article ID)
      try {
        var u = new URL(url);
        var path = u.pathname;
        // BBC patterns: /news/articles/<id> or /news/<section>-<digits> are articles; /news/<word> is a section
        if (/bbc\.(co\.|com)/.test(u.hostname) && /^\/news\/[a-z]+\/?$/i.test(path)) return false;
        // Generic: paths ending in just a word (no ID/slug) are likely sections
        if (/\/(news|world|business|sport|tech|entertainment|politics|science|health)\/?$/i.test(path)) return false;
      } catch (e) { /* ignore URL parse errors */ }
      
      // Check for article JSON-LD types
      var ld = h.findLd(doc, NEWS);
      if (ld) {
        // Require headline or name to confirm it's an article, not just metadata
        if (ld.headline || ld.name) return true;
      }
      
      // Check for CollectionPage/WebPage/ItemList types which indicate section pages
      var allLd = h.jsonLd(doc);
      for (var i = 0; i < allLd.length; i++) {
        var types = h.ldTypes(allLd[i]);
        for (var j = 0; j < types.length; j++) {
          if (/^(CollectionPage|WebPage|ItemList)$/i.test(types[j])) {
            // If it's ONLY these types (no article type), reject
            if (!ld) return false;
          }
        }
      }
      
      // Fallback: og:type=article with published_time
      if (h.metaContent(doc, 'og:type') === 'article') {
        var published = h.metaContent(doc, 'article:published_time') || h.metaContent(doc, 'datePublished');
        if (published) return true;
      }
      
      return false;
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

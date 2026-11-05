/* Wikipedia articles: lead + sections, infobox as key/value list, no references/navboxes. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  var STOP = /^(references|notes|citations|sources|external links|see also|further reading|bibliography|footnotes)$/i;
  P.register({
    name: 'wikipedia',
    order: 50,
    match: function (url) {
      var u = new URL(url);
      return /(^|\.)wikipedia\.org$/.test(u.hostname) && u.pathname.indexOf('/wiki/') === 0 && !/^\/wiki\/(Special|Talk|User|Wikipedia|File|Help|Category|Template|Portal):/.test(u.pathname);
    },
    extract: function (doc) {
      var src = h.$(doc, '#mw-content-text .mw-parser-output');
      if (!src) return null;
      var body = src.cloneNode(true);
      var info = [];
      var box = h.$(body, 'table.infobox');
      if (box) {
        h.$$(box, 'tr').forEach(function (tr) {
          var k = h.txt(h.$(tr, 'th')), v = h.txt(h.$(tr, 'td'));
          if (k && v && k.length < 60) info.push('- **' + k + '**: ' + h.cap(v.replace(/\[\d+\]/g, ''), 200));
        });
      }
      h.$$(body, 'table.infobox, .reference, sup.reference, .mw-editsection, .navbox, .vertical-navbox, .metadata, #toc, .toc, .hatnote, .reflist, .mw-references-wrap, .sidebar, .shortdescription, .noprint, style, .mw-empty-elt, .thumb, figure').forEach(function (el) {
        el.parentNode && el.parentNode.removeChild(el);
      });
      // cut everything from the first References/External links section onwards
      var heads = h.$$(body, 'h2');
      for (var i = 0; i < heads.length; i++) {
        if (STOP.test(h.txt(heads[i]).replace(/\[edit\]/i, '').trim())) {
          var start = heads[i].closest('.mw-heading') || heads[i];
          var n = start;
          while (n) { var nx = n.nextSibling; n.parentNode.removeChild(n); n = nx; }
          break;
        }
      }
      var title = h.txt(h.first(doc, ['#firstHeading', 'h1'])) || doc.title.replace(/ - Wikipedia$/, '');
      var mdText = h.md(body).replace(/\[\d+\]/g, '');
      var lead = h.txt(h.$(body, 'p:not(.mw-empty-elt)'));
      return {
        kind: 'wikipedia-article', title: title,
        markdown: (info.length ? '## At a glance\n\n' + info.slice(0, 25).join('\n') + '\n\n' : '') + mdText,
        excerpt: h.cap(lead, 280), meta: { site: 'Wikipedia', lang: (doc.documentElement.getAttribute('lang') || '') || undefined },
      };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

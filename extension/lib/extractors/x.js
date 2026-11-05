/* X / Twitter status pages: main post plus visible thread replies. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  P.register({
    name: 'x',
    order: 30,
    match: function (url) {
      var u = new URL(url);
      return /(^|\.)(x|twitter)\.com$/.test(u.hostname) && /^\/[^/]+\/status\/\d+/.test(u.pathname);
    },
    extract: function (doc, url) {
      var arts = h.$$(doc, 'article[data-testid="tweet"]').slice(0, 11);
      if (!arts.length) return null;
      function one(a) {
        var user = h.txt(h.$(a, '[data-testid="User-Name"]')).replace(/·.*$/, '').trim();
        var t = h.$(a, 'time');
        var text = h.$(a, '[data-testid="tweetText"]');
        var imgs = h.$$(a, '[data-testid="tweetPhoto"] img').map(function (i) { return i.getAttribute('alt'); }).filter(function (x) { return x && x !== 'Image'; });
        return { user: user, time: t ? t.getAttribute('datetime') : '', text: text ? h.md(text) : '', imgs: imgs };
      }
      var main = one(arts[0]);
      var handle = (new URL(url).pathname.split('/')[1]) || '';
      var lines = [main.text || '(no text)'];
      main.imgs.forEach(function (a) { lines.push('[image: ' + a + ']'); });
      var rest = arts.slice(1).map(one).filter(function (r) { return r.text; });
      if (rest.length) {
        lines.push('', '## Thread and replies', '');
        rest.forEach(function (r) { lines.push('**' + r.user + '**: ' + r.text, ''); });
      }
      var title = (main.user || '@' + handle) + ': ' + h.cap((main.text || '').replace(/\s+/g, ' '), 90);
      return { kind: 'x-post', title: title, markdown: lines.join('\n'), excerpt: h.cap(main.text, 280), meta: { author: main.user || '@' + handle, published: main.time || undefined } };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

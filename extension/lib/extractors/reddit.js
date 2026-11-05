/* Reddit threads: post + top comments, via the thread's own .json (same origin), DOM fallback. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  var MAX_COMMENTS = 15;

  function fromJson(data) {
    var post = data[0].data.children[0].data;
    var lines = [];
    lines.push('**r/' + post.subreddit + '** · u/' + post.author + ' · ' + post.score + ' points · ' + post.num_comments + ' comments', '');
    if (post.selftext) lines.push(post.selftext, '');
    else if (post.url && post.url.indexOf(post.permalink) === -1) lines.push('Link: ' + post.url, '');
    var comments = [];
    (function walk(children, depth) {
      (children || []).forEach(function (c) {
        if (comments.length >= MAX_COMMENTS || c.kind !== 't1') return;
        var d = c.data;
        if (!d.body || d.body === '[deleted]' || d.body === '[removed]' || d.author === 'AutoModerator') return;
        comments.push((depth ? '  '.repeat(depth) + '↳ ' : '') + '**u/' + d.author + '** (' + d.score + '): ' + h.cap(d.body.replace(/\n{2,}/g, '\n'), 1500));
        if (depth < 2 && d.replies && d.replies.data) walk(d.replies.data.children.slice(0, 3), depth + 1);
      });
    })(data[1].data.children, 0);
    if (comments.length) lines.push('## Top comments', '', comments.join('\n\n'));
    return {
      kind: 'reddit-thread', title: post.title, markdown: lines.join('\n'), excerpt: h.cap(post.selftext || post.title, 280),
      meta: { author: 'u/' + post.author, subreddit: 'r/' + post.subreddit, score: post.score, comments: post.num_comments, published: new Date(post.created_utc * 1000).toISOString() },
    };
  }

  function fromDom(doc) {
    var post = h.$(doc, 'shreddit-post');
    var title = post ? post.getAttribute('post-title') : h.txt(h.first(doc, ['h1', 'a.title']));
    var body = h.txt(h.first(doc, ['shreddit-post [slot="text-body"]', '.usertext-body .md', '[data-test-id="post-content"]']));
    var comments = h.$$(doc, 'shreddit-comment').slice(0, MAX_COMMENTS).map(function (c) {
      return '**u/' + (c.getAttribute('author') || '?') + '** (' + (c.getAttribute('score') || '0') + '): ' + h.cap(h.txt(h.$(c, '[slot="comment"]') || c), 1500);
    });
    if (!comments.length) comments = h.$$(doc, '.comment .usertext-body .md').slice(0, MAX_COMMENTS).map(function (c) { return '- ' + h.cap(h.txt(c), 1500); });
    var meta = {};
    if (post && post.getAttribute('author')) meta.author = 'u/' + post.getAttribute('author');
    if (post && post.getAttribute('subreddit-prefixed-name')) meta.subreddit = post.getAttribute('subreddit-prefixed-name');
    return { kind: 'reddit-thread', title: title, markdown: [body, '', comments.length ? '## Top comments\n\n' + comments.join('\n\n') : ''].join('\n'), meta: meta };
  }

  P.register({
    name: 'reddit',
    order: 20,
    match: function (url) {
      var u = new URL(url);
      return /(^|\.)reddit\.com$/.test(u.hostname) && /\/comments\/[a-z0-9]+/i.test(u.pathname);
    },
    extract: async function (doc, url, ctx) {
      var f = (ctx && ctx.fetch) || (typeof fetch === 'function' ? fetch : null);
      if (f && !(ctx && ctx.noNetwork)) {
        try {
          var u = new URL(url);
          var r = await f(u.origin + u.pathname.replace(/\/$/, '') + '.json?limit=40&sort=top&raw_json=1', { credentials: 'include', headers: { accept: 'application/json' } });
          if (r.ok) return fromJson(await r.json());
        } catch (e) { /* fall back to DOM */ }
      }
      return fromDom(doc);
    },
    _fromJson: fromJson,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Stack Overflow / Stack Exchange: question + accepted (or top) answer + next two answers by score. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  function score(el) { var s = h.$(el, '[itemprop="upvoteCount"], .js-vote-count'); return parseInt((s && (s.getAttribute('data-value') || h.txt(s))) || '0', 10) || 0; }
  P.register({
    name: 'stackexchange',
    order: 60,
    match: function (url) {
      var u = new URL(url);
      return /^\/questions\/\d+/.test(u.pathname) && /(^|\.)(stackoverflow\.com|stackexchange\.com|superuser\.com|serverfault\.com|askubuntu\.com|mathoverflow\.net|stackapps\.com)$/.test(u.hostname);
    },
    extract: function (doc) {
      var q = h.$(doc, '#question, .question');
      if (!q) return null;
      var title = h.txt(h.first(doc, ['#question-header h1', 'h1[itemprop="name"]', 'h1']));
      var tags = h.$$(doc, '.question .post-tag, #question .post-tag').map(h.txt).filter(Boolean);
      tags = tags.filter(function (t, i) { return tags.indexOf(t) === i; });
      var answers = h.$$(doc, '.answer').map(function (a) {
        return { el: a, score: score(a), accepted: a.classList.contains('accepted-answer') || !!h.$(a, '.js-accepted-answer-indicator:not(.d-none), [itemprop="acceptedAnswer"]') || a.getAttribute('itemprop') === 'acceptedAnswer' };
      });
      var accepted = answers.filter(function (a) { return a.accepted; })[0];
      var rest = answers.filter(function (a) { return a !== accepted; }).sort(function (a, b) { return b.score - a.score; });
      var chosen = (accepted ? [accepted] : []).concat(rest).slice(0, 3);
      var lines = ['**Question** (score ' + score(q) + ')' + (tags.length ? ' · tags: ' + tags.join(', ') : ''), '', h.cap(h.md(h.$(q, '.s-prose, .post-text, .js-post-body')), 20000)];
      chosen.forEach(function (a, i) {
        lines.push('', '## ' + (a.accepted ? 'Accepted answer' : i === 0 ? 'Top answer' : 'Answer') + ' (score ' + a.score + ')', '', h.cap(h.md(h.$(a.el, '.s-prose, .post-text, .js-post-body')), 15000));
      });
      return { kind: 'stackoverflow-question', title: title, markdown: lines.join('\n'), meta: { tags: tags.join(', ') || undefined, score: score(q), answers: answers.length, accepted: accepted ? 'yes' : 'no' } };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

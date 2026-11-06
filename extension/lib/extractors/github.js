/* GitHub repos (README + about), issues and pull requests (body + comments). */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  var RESERVED = /^(settings|orgs|organizations|marketplace|explore|topics|trending|collections|sponsors|notifications|pulls|issues|search|login|logout|signup|features|pricing|about|enterprise|codespaces|new|apps|security|customer-stories|readme|site|team|blog|events|stars|dashboard)$/i;

  function parts(url) { return new URL(url).pathname.split('/').filter(Boolean); }

  P.register({
    name: 'github',
    order: 40,
    match: function (url) {
      var u = new URL(url);
      if (u.hostname !== 'github.com') return false;
      var p = parts(url);
      return p.length >= 2 && !RESERVED.test(p[0]) && (p.length === 2 || /^(issues|pull)$/.test(p[2]) && /^\d+$/.test(p[3] || '') || (p[2] === 'tree' || p[2] === 'blob') && /\.md$/i.test(p[p.length - 1] || 'x.md'));
    },
    extract: function (doc, url) {
      var p = parts(url);
      var repo = p[0] + '/' + p[1];
      if (p[2] === 'issues' || p[2] === 'pull') {
        var isPr = p[2] === 'pull';
        var title = h.txt(h.first(doc, ['[data-testid="issue-title"]', 'bdi.js-issue-title', '.js-issue-title', 'h1 bdi', 'h1'])) || doc.title;
        var state = h.txt(h.first(doc, ['[data-testid="header-state"]', '.State', 'span[title^="Status:"]']));
        var bodies = h.$$(doc, '[data-testid="markdown-body"], .comment-body, .markdown-body.js-comment-body');
        var seen = [];
        bodies = bodies.filter(function (b) { if (seen.some(function (s) { return s.contains(b) || b.contains(s); })) return false; seen.push(b); return true; });
        var authors = h.$$(doc, '[data-testid="avatar-link"], a.author, .timeline-comment-header a.Link--primary').map(h.txt).filter(Boolean);
        var lines = ['**' + repo + '** #' + p[3] + (state ? ' · ' + state : ''), ''];
        bodies.slice(0, 21).forEach(function (b, i) {
          lines.push(i === 0 ? '## Description' : '### Comment' + (authors[i] ? ' by ' + authors[i] : ''), '', h.cap(h.md(b), 6000), '');
        });
        return { kind: isPr ? 'github-pr' : 'github-issue', title: title + ' · ' + repo + '#' + p[3], markdown: lines.join('\n'), meta: { repo: repo, state: state || undefined, author: authors[0] || undefined } };
      }
      var about = h.txt(h.first(doc, ['.BorderGrid-cell p.f4', '[data-testid="repo-description"]', 'p.f4.my-3'])) 
        || h.metaContent(doc, 'og:description') 
        || h.metaContent(doc, 'description');
      // Strip GitHub's boilerplate prefixes/suffixes
      if (about) {
        about = about.replace(/^GitHub - [^:]+:\s*/, ''); // "GitHub - owner/repo: description"
        about = about.replace(/\s+-\s+[\w.-]+\/[\w.-]+$/, ''); // " - owner/repo" suffix (only owner/repo tokens)
        about = about.replace(/\.\s*Contribute to .+ development by creating an account on GitHub\.\s*$/, ''); // boilerplate suffix
        // Also match boilerplate that doesn't have the leading ". "
        if (/^Contribute to .+ development by creating an account on GitHub\.?\s*$/.test(about)) about = '';
        // Trim and treat empty as undefined
        about = about.trim() || undefined;
      }
      var topics = h.$$(doc, 'a.topic-tag, [data-octo-click="topic_click"]').map(h.txt).filter(Boolean).slice(0, 15);
      var stars = h.txt(h.first(doc, ['#repo-stars-counter-star', '.js-social-count', 'a[href$="/stargazers"] strong']));
      var readme = h.first(doc, ['article.markdown-body', '#readme article', '[data-testid="readme"] .markdown-body', '.markdown-body']);
      var lines = ['**' + repo + '**' + (stars ? ' · ★ ' + stars : ''), '', about || ''];
      if (topics.length) lines.push('', 'Topics: ' + topics.join(', '));
      if (readme) lines.push('', '## README', '', h.cap(h.md(readme), 60000));
      return { kind: 'github-repo', title: repo + (about ? ': ' + h.cap(about, 100) : ''), markdown: lines.join('\n'), excerpt: about, meta: { repo: repo, stars: stars || undefined, topics: topics.join(', ') || undefined, description: about ? h.cap(about, 300) : undefined } };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

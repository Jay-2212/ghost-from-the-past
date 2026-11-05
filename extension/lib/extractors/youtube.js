/* YouTube watch/shorts pages: title, channel, date, description, transcript (when the captions endpoint answers). */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;

  function videoId(url) {
    var u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (u.pathname.indexOf('/shorts/') === 0) return u.pathname.split('/')[2];
    return u.searchParams.get('v');
  }
  function stamp(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return '[' + (m < 10 ? '0' : '') + m + ':' + ((s % 60) < 10 ? '0' : '') + (s % 60) + ']';
  }
  function pickTrack(tracks) {
    if (!tracks || !tracks.length) return null;
    var en = function (t) { return /^en/i.test(t.languageCode || ''); };
    return tracks.filter(function (t) { return en(t) && t.kind !== 'asr'; })[0] ||
      tracks.filter(en)[0] || tracks.filter(function (t) { return t.kind !== 'asr'; })[0] || tracks[0];
  }
  function flattenJson3(j) {
    var out = [], buf = '', bufStart = 0;
    (j.events || []).forEach(function (ev) {
      if (!ev.segs) return;
      var t = ev.segs.map(function (s) { return s.utf8 || ''; }).join('').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (!buf) bufStart = ev.tStartMs || 0;
      buf += (buf ? ' ' : '') + t;
      if ((ev.tStartMs || 0) - bufStart >= 30000) { out.push(stamp(bufStart) + ' ' + buf); buf = ''; }
    });
    if (buf) out.push(stamp(bufStart) + ' ' + buf);
    return out.join('\n\n');
  }
  async function transcript(pr, ctx) {
    var tracks = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
    var t = pickTrack(tracks);
    var f = (ctx && ctx.fetch) || (typeof fetch === 'function' ? fetch : null);
    if (!t || !t.baseUrl || !f) return '';
    try {
      var r = await f(t.baseUrl + '&fmt=json3', { credentials: 'include' });
      if (!r.ok) return '';
      var body = await r.text();
      if (!body) return ''; // YouTube sometimes demands a proof-of-origin token and answers empty
      return h.cap(flattenJson3(JSON.parse(body)), 60000);
    } catch (e) {
      return '';
    }
  }
  function domTranscript(doc) {
    var segs = h.$$(doc, 'ytd-transcript-segment-renderer');
    return segs.map(function (s) {
      return (h.txt(h.$(s, '.segment-timestamp')) ? '[' + h.txt(h.$(s, '.segment-timestamp')) + '] ' : '') + h.txt(h.$(s, '.segment-text') || s);
    }).join('\n');
  }

  P.register({
    name: 'youtube',
    order: 10,
    match: function (url) {
      var u = new URL(url);
      return /(^|\.)youtube\.com$/.test(u.hostname) && (u.pathname === '/watch' || u.pathname.indexOf('/shorts/') === 0) || u.hostname === 'youtu.be';
    },
    extract: async function (doc, url, ctx) {
      var id = videoId(url);
      var pr = h.scriptJson(doc, 'ytInitialPlayerResponse');
      // after in-app navigation the inline JSON still describes the first video: only trust it if the id matches
      if (pr && (!pr.videoDetails || pr.videoDetails.videoId !== id)) pr = null;
      var vd = (pr && pr.videoDetails) || {};
      var mf = (pr && pr.microformat && pr.microformat.playerMicroformatRenderer) || {};
      var title = vd.title || h.txt(h.first(doc, ['h1.ytd-watch-metadata', '#title h1', 'h1'])) || h.metaContent(doc, 'og:title');
      var channel = vd.author || h.txt(h.first(doc, ['ytd-channel-name a', '#owner #channel-name a', 'span[itemprop="author"] link[itemprop="name"]'])) ||
        (h.$(doc, 'span[itemprop="author"] link[itemprop="name"]') || { getAttribute: function () { return ''; } }).getAttribute('content');
      var desc = vd.shortDescription || h.txt(h.first(doc, ['#description-inline-expander', 'ytd-text-inline-expander', '#description'])) || h.metaContent(doc, 'description');
      var published = mf.publishDate || h.metaContent(doc, 'datePublished') || h.metaContent(doc, 'uploadDate');
      var tr = (await transcript(pr, ctx)) || domTranscript(doc);
      var meta = { channel: channel || undefined, published: published || undefined, videoId: id || undefined };
      if (vd.lengthSeconds) meta.duration = Math.round(vd.lengthSeconds / 60) + ' min';
      if (vd.viewCount) meta.views = vd.viewCount;
      meta.transcript = tr ? 'yes' : 'no';
      var parts = ['## Description', '', desc || '(no description)'];
      if (tr) parts.push('', '## Transcript', '', tr);
      return { kind: 'youtube-video', title: title, markdown: parts.join('\n'), excerpt: h.cap(desc, 280), meta: meta };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

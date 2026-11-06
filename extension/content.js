/* Ghost from the Past — content script (classic). Captures the page through GhostPipeline and counts
 * active time (only while the tab is visible AND focused). Never runs in incognito. */
(function () {
  'use strict';
  if (window.top !== window) return;
  if (chrome.extension && chrome.extension.inIncognitoContext) return;
  if (window.__ghostFromThePast) return;
  window.__ghostFromThePast = true;

  var TICK_MS = 1000, FLUSH_MS = 15000, MAX_GAP_MS = 5000;
  var isWorkerPage = !!document.querySelector('meta[name="ghost-from-the-past"][content="worker"]');

  // ---- Worker landing page: hand the URL to the extension when the user clicks "Connect to extension" ----
  if (isWorkerPage) {
    document.documentElement.dataset.ghostExtension = '1';
    window.addEventListener('message', function (ev) {
      if (ev.source !== window || ev.origin !== location.origin) return;
      var d = ev.data;
      if (!d || d.source !== 'ghost-worker' || d.type !== 'connect') return;
      chrome.runtime.sendMessage({ type: 'ghost:connect-offer', workerUrl: location.origin }, function (res) {
        void chrome.runtime.lastError;
        document.documentElement.dataset.ghostConnect = res && res.ok ? 'sent' : 'refused';
      });
    });
    return; // never remember the Worker's own pages
  }

  function canonicalUrl() {
    var href = location.href.split('#')[0];
    var link = document.querySelector('link[rel="canonical"]');
    if (link && link.href) {
      try {
        var c = new URL(link.href, location.href);
        // only trust a same-origin canonical that keeps the same path family (avoids SPA canonicals pointing at /)
        if (c.origin === location.origin && c.pathname !== '/' ) return c.href.split('#')[0];
      } catch (e) { /* ignore */ }
    }
    return href;
  }

  var state = null;
  function reset() {
    state = { href: location.href, url: canonicalUrl(), firstSeen: Date.now(), activeMs: 0, sentMs: 0, last: Date.now(), bestLen: 0, captures: 0 };
  }

  function getSettings() {
    return chrome.storage.local.get(['paused', 'blocklist', 'workerUrl', 'secret']);
  }
  function allowed(s, url, href) {
    if (s.paused) return false;
    if (!(s.workerUrl && s.secret)) return false;
    var extra = [];
    try { if (s.workerUrl) extra.push(new URL(s.workerUrl).hostname); } catch (e) { /* ignore */ }
    var list = typeof s.blocklist === 'string' ? s.blocklist : GhostBlocklist.DEFAULT_BLOCKLIST;
    return !GhostBlocklist.isBlocked(url, list, extra) && (!href || !GhostBlocklist.isBlocked(href, list, extra));
  }
  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; });
    } catch (e) { /* extension reloaded: ignore */ }
  }

  async function capture() {
    var st = state;
    var s = await getSettings();
    if (!allowed(s, st.url, location.href)) return;
    var res;
    try {
      res = await GhostPipeline.run(document, location.href, {});
    } catch (e) {
      return;
    }
    if (st !== state || !res || res.skip) return;
    st.captures++;
    var len = res.markdown.length;
    if (len <= st.bestLen * 1.15) return; // only resend when the page grew meaningfully (late-loading SPAs)
    st.bestLen = len;
    send({
      type: 'ghost:page',
      page: {
        url: st.url, href: location.href, title: res.title, domain: res.domain, kind: res.kind, meta: res.meta, markdown: res.markdown,
        excerpt: res.excerpt, lang: res.lang, firstSeen: st.firstSeen, extractor: res.extractor,
      },
    });
  }

  function schedule() {
    var my = state;
    setTimeout(function () { if (my === state) capture(); }, 2500);
    setTimeout(function () { if (my === state) capture(); }, 10000);
  }

  function isActive() {
    return document.visibilityState === 'visible' && document.hasFocus();
  }
  function tick() {
    var now = Date.now();
    if (isActive()) state.activeMs += Math.min(now - state.last, MAX_GAP_MS);
    state.last = now;
  }
  function flush() {
    tick();
    var delta = state.activeMs - state.sentMs;
    if (delta >= 500) {
      state.sentMs = state.activeMs;
      send({ type: 'ghost:time', url: state.url, href: location.href, deltaMs: delta, firstSeen: state.firstSeen });
    }
  }

  reset();
  schedule();
  setInterval(tick, TICK_MS);
  setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); else state.last = Date.now(); });
  window.addEventListener('focus', function () { state.last = Date.now(); });
  window.addEventListener('blur', function () { tick(); });
  window.addEventListener('pagehide', flush);

  // SPA navigation (YouTube, GitHub, X, Reddit…): treat a URL change as a new page
  setInterval(function () {
    if (location.href.split('#')[0] !== state.href.split('#')[0]) {
      flush();
      reset();
      schedule();
    }
  }, 1000);

  // test hook: lets the e2e test force an immediate capture + flush without waiting
  window.addEventListener('ghost:test-capture', function () { state.bestLen = 0; capture(); flush(); });
})();

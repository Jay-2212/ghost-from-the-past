// Ghost from the Past — background service worker (MV3 module; also a Firefox background script).
// Holds the local queue, redacts, enforces the blocklist/pause, and syncs batches to the user's own Worker.
import './lib/blocklist.js';
import './lib/redact.js';
import { getSettings, setSettings, generateSecret, isAcceptableWorkerUrl, normaliseWorkerUrl, workerHost } from './lib/settings.js';

const B = globalThis.GhostBlocklist;
const R = globalThis.GhostRedact;
const ALARM = 'ghost-sync';
const BATCH = 20;
const STALE_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 30000;
const VERSION = chrome.runtime.getManifest().version;

// fetch with timeout
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

// ---------- tiny async mutex so concurrent messages never clobber the queue ----------
let lock = Promise.resolve();
function locked(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function keyOf(url) {
  return String(url || '').split('#')[0];
}
async function getQueue() {
  return (await chrome.storage.local.get('queue')).queue || {};
}
async function getStats() {
  const s = (await chrome.storage.local.get('stats')).stats || {};
  if (s.day !== today()) {
    s.day = today();
    s.todayUrls = [];
    s.pagesToday = 0;
  }
  s.recent = s.recent || [];
  return s;
}

async function setBadge() {
  const s = await getSettings();
  const configured = !!(s.workerUrl && s.secret);
  await chrome.action.setBadgeBackgroundColor({ color: '#111111' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#F7F5F0' });
  await chrome.action.setBadgeText({ text: s.paused ? 'off' : configured ? '' : '!' });
}

function ensureAlarm() {
  chrome.alarms.get(ALARM, a => {
    if (!a) chrome.alarms.create(ALARM, { periodInMinutes: 5, delayInMinutes: 1 });
  });
}

// ---------- install / startup ----------
// The secret is created in exactly one place (under the lock) so onboarding and onInstalled can never race.
function ensureSecret() {
  return locked(async () => {
    const { secret } = await chrome.storage.local.get('secret');
    if (secret) return secret;
    const fresh = generateSecret();
    await chrome.storage.local.set({ secret: fresh });
    return fresh;
  });
}

chrome.runtime.onInstalled.addListener(async details => {
  await ensureSecret();
  if (typeof (await chrome.storage.local.get('blocklist')).blocklist !== 'string') await setSettings({ blocklist: B.defaultText() });
  ensureAlarm();
  await setBadge();
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  setBadge();
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === ALARM) syncNow('alarm');
});

// ---------- capture ----------
async function allowedUrl(url) {
  const s = await getSettings();
  if (s.paused) return { ok: false, s };
  const host = workerHost(s);
  return { ok: !B.isBlocked(url, s.blocklist, host ? [host] : []), s };
}

function onPage(page, sender) {
  return locked(async () => {
    if (!page || typeof page.url !== 'string' || typeof page.markdown !== 'string') return { ok: false };
    const { ok, s } = await allowedUrl(page.url);
    if (!ok) return { ok: false, blocked: true };
    R.redactPage(page, { emails: s.redactEmails !== false });
    const q = await getQueue();
    const k = keyOf(page.url);
    const now = Date.now();
    const prev = q[k];
    q[k] = {
      url: k,
      title: String(page.title || '').slice(0, 300),
      domain: page.domain || '',
      kind: page.kind || 'article',
      meta: page.meta || null,
      markdown: page.markdown.slice(0, 200000),
      excerpt: String(page.excerpt || '').slice(0, 300),
      lang: page.lang || '',
      firstSeen: Math.min(prev?.firstSeen ?? now, page.firstSeen || now),
      lastSeen: now,
      activeMs: prev?.activeMs ?? 0,
      activeMsDelta: prev?.activeMsDelta ?? 0,
      rev: (prev?.rev ?? 0) + 1,
      tabId: sender?.tab?.id,
    };
    await chrome.storage.local.set({ queue: q });
    const st = await getStats();
    if (!st.todayUrls.includes(k)) {
      st.todayUrls.push(k);
      if (st.todayUrls.length > 5000) st.todayUrls = st.todayUrls.slice(-5000);
      st.pagesToday = st.todayUrls.length;
    }
    st.recent = [{ title: q[k].title, url: k, at: now, synced: false }, ...st.recent.filter(r => r.url !== k)].slice(0, 10);
    await chrome.storage.local.set({ stats: st });
    return { ok: true };
  });
}

function onTime(msg) {
  return locked(async () => {
    const delta = Math.max(0, Math.min(Number(msg.deltaMs) || 0, 3600 * 1000));
    if (!delta || typeof msg.url !== 'string') return { ok: false };
    const { ok } = await allowedUrl(msg.url);
    if (!ok) return { ok: false };
    const q = await getQueue();
    const k = keyOf(msg.url);
    const now = Date.now();
    const e = q[k] || { url: k, markdown: '', firstSeen: msg.firstSeen || now, activeMs: 0, activeMsDelta: 0, rev: 0, timeOnly: true };
    e.activeMs = (e.activeMs || 0) + delta;
    e.activeMsDelta = (e.activeMsDelta || 0) + delta;
    e.lastSeen = now;
    e.rev = (e.rev || 0) + 1;
    q[k] = e;
    await chrome.storage.local.set({ queue: q });
    return { ok: true };
  });
}

// ---------- sync ----------
let syncing = null;
function syncNow(reason) {
  if (!syncing) syncing = doSync(reason).finally(() => (syncing = null));
  return syncing;
}

async function doSync() {
  const s = await getSettings();
  const st0 = await getStats();
  if (!s.workerUrl || !s.secret) return { ok: false, error: 'Not connected to a Worker yet.' };
  if (s.paused) return { ok: true, sent: 0, paused: true };
  const now = Date.now();
  const minDwell = Number.isFinite(+s.minDwellMs) ? +s.minDwellMs : 5000;

  // pick what is ready, drop what went stale
  const ready = await locked(async () => {
    const q = await getQueue();
    let changed = false;
    const out = [];
    for (const [k, e] of Object.entries(q)) {
      const age = now - (e.lastSeen || e.firstSeen || now);
      const hasPage = !!e.markdown;
      if (hasPage && (e.activeMs || 0) >= minDwell) out.push({ ...e });
      else if (age > STALE_MS) {
        delete q[k];
        changed = true;
      }
    }
    if (changed) await chrome.storage.local.set({ queue: q });
    return out;
  });

  let sent = 0;
  let error = null;
  for (let i = 0; i < ready.length; i += BATCH) {
    const batch = ready.slice(i, i + BATCH);
    try {
      const res = await fetchWithTimeout(`${s.workerUrl}/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.secret}` },
        body: JSON.stringify({
          client: { name: 'ghost-extension', version: VERSION },
          pages: batch.map(e => ({
            url: e.url, title: e.title, domain: e.domain, kind: e.kind, meta: e.meta, markdown: e.markdown, excerpt: e.excerpt, lang: e.lang,
            firstSeen: e.firstSeen, lastSeen: e.lastSeen, activeMsDelta: e.activeMsDelta || 0,
          })),
        }),
      });
      if (!res.ok) {
        error = res.status === 401 ? 'The Worker rejected the secret (401).' : `Worker answered ${res.status}.`;
        break;
      }
      await res.json().catch(() => ({}));
      sent += batch.length;
      // remove what was sent, but keep anything that arrived while the request was in flight
      await locked(async () => {
        const q = await getQueue();
        for (const e of batch) {
          const cur = q[e.url];
          if (!cur) continue;
          if (cur.rev === e.rev) delete q[e.url];
          else {
            cur.activeMsDelta = Math.max(0, (cur.activeMsDelta || 0) - (e.activeMsDelta || 0));
            if (cur.markdown === e.markdown) cur.syncedOnce = true;
          }
        }
        await chrome.storage.local.set({ queue: q });
      });
    } catch (err) {
      error = `Could not reach the Worker (${(err && err.message) || 'network error'}).`;
      break;
    }
  }

  const st = await getStats();
  st.lastSyncAttemptAt = now;
  if (!error) {
    st.lastSyncAt = Date.now();
    st.lastSyncCount = sent;
    st.lastError = null;
  } else st.lastError = error;
  st.totalSynced = (st0.totalSynced || 0) + sent;
  const sentUrls = new Set(ready.slice(0, sent).map(e => e.url));
  st.recent = (st.recent || []).map(r => (sentUrls.has(r.url) ? { ...r, synced: true } : r));
  await chrome.storage.local.set({ stats: st });
  return error ? { ok: false, sent, error } : { ok: true, sent };
}

// ---------- connection helpers ----------
async function testConnection(workerUrl, secret) {
  const url = normaliseWorkerUrl(workerUrl);
  if (!url || !isAcceptableWorkerUrl(url)) return { ok: false, error: 'Use the https:// address of your Worker.' };
  try {
    const h = await fetchWithTimeout(`${url}/health`).then(r => r.json());
    if (!h || h.name !== 'ghost-from-the-past') return { ok: false, error: 'That address is not a Ghost from the Past Worker.' };
    if (h.configured === false) return { ok: false, error: 'The Worker has no GHOST_SECRET yet. Add it in Cloudflare (Settings → Variables and Secrets).' };
    const r = await fetchWithTimeout(`${url}/api/stats`, { headers: { authorization: `Bearer ${secret}` } });
    if (r.status === 401) return { ok: false, error: 'The Worker is alive, but the secret does not match.' };
    if (!r.ok) return { ok: false, error: `Worker answered ${r.status}.` };
    const data = await r.json();
    return { ok: true, url, pages: data.pages, vectorMode: data.vectorMode, embedMode: data.embedMode };
  } catch (e) {
    return { ok: false, error: `Could not reach ${url} (${e.message}).` };
  }
}

async function focusOnboarding() {
  const url = chrome.runtime.getURL('onboarding.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true }).catch(() => {});
  } else await chrome.tabs.create({ url: `${url}#confirm` });
}

async function status() {
  const s = await getSettings();
  const st = await getStats();
  const q = await getQueue();
  const entries = Object.values(q);
  return {
    configured: !!(s.workerUrl && s.secret),
    onboarded: !!s.onboarded,
    paused: !!s.paused,
    workerUrl: s.workerUrl,
    pagesToday: st.pagesToday || 0,
    queued: entries.filter(e => e.markdown).length,
    lastSyncAt: st.lastSyncAt || null,
    lastSyncCount: st.lastSyncCount || 0,
    lastError: st.lastError || null,
    totalSynced: st.totalSynced || 0,
    recent: st.recent || [],
    version: VERSION,
  };
}

// ---------- messages ----------
const fromExtensionPage = sender => sender && sender.id === chrome.runtime.id && (!sender.tab || (sender.url || '').startsWith(chrome.runtime.getURL('')));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const reply = p => {
    Promise.resolve(p).then(sendResponse, e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // keep the channel open for the async answer
  };
  if (!msg || typeof msg.type !== 'string') return false;
  if (sender.tab && sender.tab.incognito) return false; // never, ever capture incognito

  switch (msg.type) {
    // from content scripts
    case 'ghost:page':
      return reply(onPage(msg.page, sender));
    case 'ghost:time':
      return reply(onTime(msg));
    case 'ghost:connect-offer':
      return reply((async () => {
        const s = await getSettings();
        const url = normaliseWorkerUrl(msg.workerUrl);
        const senderOrigin = sender.url ? new URL(sender.url).origin : '';
        if (!url || url !== senderOrigin || !isAcceptableWorkerUrl(url)) return { ok: false };
        if (s.onboarded && s.workerUrl) return { ok: false, already: true };
        await chrome.storage.local.set({ pendingOffer: { workerUrl: url, at: Date.now() } });
        await focusOnboarding();
        return { ok: true };
      })());
  }

  // everything below is only for our own popup / options / onboarding pages
  if (!fromExtensionPage(sender)) return false;
  switch (msg.type) {
    case 'ghost:status':
      return reply(status());
    case 'ghost:ensure-secret':
      return reply(ensureSecret().then(secret => ({ ok: true, secret })));
    case 'ghost:sync':
      return reply(syncNow('manual'));
    case 'ghost:pause':
      return reply(setSettings({ paused: !!msg.paused }).then(setBadge).then(status));
    case 'ghost:test':
      return reply(testConnection(msg.workerUrl, msg.secret));
    case 'ghost:connect':
      return reply((async () => {
        const t = await testConnection(msg.workerUrl, msg.secret);
        if (!t.ok) return t;
        await setSettings({ workerUrl: t.url, secret: msg.secret, onboarded: msg.onboarded ?? true });
        await chrome.storage.local.remove('pendingOffer');
        // never keep anything captured from the Worker itself
        await locked(async () => {
          const q = await getQueue();
          const host = new URL(t.url).hostname;
          for (const k of Object.keys(q)) if (B.isBlocked(k, '', [host])) delete q[k];
          await chrome.storage.local.set({ queue: q });
        });
        await setBadge();
        return t;
      })());
    case 'ghost:forget-site':
      return reply(locked(async () => {
        const pattern = B.patternForSite(msg.url);
        if (!pattern) return { ok: false };
        const s = await getSettings();
        const lines = s.blocklist.split('\n');
        if (!lines.map(l => l.trim()).includes(pattern)) lines.push(pattern);
        await setSettings({ blocklist: lines.join('\n') });
        const q = await getQueue();
        const removed = {};
        for (const [k, e] of Object.entries(q)) if (B.isBlocked(k, pattern)) { removed[k] = e; delete q[k]; }
        await chrome.storage.local.set({ queue: q });
        return { ok: true, pattern, removed };
      }));
    case 'ghost:undo-forget-site':
      return reply(locked(async () => {
        const s = await getSettings();
        const lines = s.blocklist.split('\n').filter(l => l.trim() !== msg.pattern);
        await setSettings({ blocklist: lines.join('\n') });
        const q = await getQueue();
        Object.assign(q, msg.removed || {});
        await chrome.storage.local.set({ queue: q });
        return { ok: true };
      }));
    case 'ghost:clear-queue':
      return reply(locked(async () => {
        await chrome.storage.local.set({ queue: {} });
        return { ok: true };
      }));
    case 'ghost:settings-changed':
      return reply(setBadge().then(() => ({ ok: true })));
  }
  return false;
});

ensureAlarm();

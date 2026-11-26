import { timeAgo } from './lib/settings.js';
import { S } from './lib/strings.js';
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
let st = null;
let tab = null;

function guide(text, pointing) {
  $('guideText').textContent = text;
  $('guide').classList.toggle('pointing', !!pointing);
}

let justSynced = null;

function render() {
  const configured = st.configured;
  $('connect').hidden = configured;
  $('main').hidden = !configured;
  if (!configured) { guide(S.guide.notConfigured, true); return; }
  $('statusText').textContent = st.paused ? S.popup.paused : S.popup.remembering;
  $('statusPill').classList.toggle('paused', st.paused);
  $('pauseBtn').textContent = st.paused ? S.popup.resume : S.popup.pause;
  $('pauseBtn').setAttribute('aria-pressed', String(st.paused));
  $('today').textContent = st.pagesToday;
  $('queued').textContent = st.queued;
  const ls = $('lastSync');
  ls.classList.toggle('error', !!st.lastError);
  ls.textContent = st.lastError ? S.popup.syncProblem(st.lastError) : st.lastSyncAt ? S.popup.lastSync(timeAgo(st.lastSyncAt), st.lastSyncCount) : S.popup.lastSyncNever;
  let host = '';
  try { host = tab && /^https?:/.test(tab.url) ? new URL(tab.url).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
  $('siteLine').textContent = host ? S.popup.thisSite(host) : S.popup.noSite;
  $('forgetSite').disabled = !host;
  if (st.lastError) guide(S.guide.error, true);
  else if (st.paused) guide(S.guide.paused);
  else if (st.queued > 0) { justSynced = null; guide(S.guide.waiting(st.queued), true); }
  else if (justSynced !== null) guide(justSynced ? S.guide.synced(justSynced) : S.guide.syncedNone);
  else if (!host) guide(S.guide.offLimits);
  else guide(S.guide.quiet);
}

async function refresh() {
  st = await send({ type: 'ghost:status' });
  render();
}

$('startSetup').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
$('settingsBtn').onclick = () => chrome.runtime.openOptionsPage();
$('pauseBtn').onclick = async () => { justSynced = null; st = await send({ type: 'ghost:pause', paused: !st.paused }); render(); };
$('syncBtn').onclick = async () => {
  const b = $('syncBtn');
  b.disabled = true; b.textContent = S.popup.syncing;
  const r = await send({ type: 'ghost:sync' });
  b.disabled = false; b.textContent = S.popup.syncNow;
  justSynced = r && r.ok && !r.paused ? r.sent : null;
  await refresh();
};
$('forgetSite').onclick = async () => {
  const r = await send({ type: 'ghost:forget-site', url: tab.url });
  const t = $('siteToast');
  if (!r || !r.ok) { t.textContent = S.err.forgetSite; return; }
  t.textContent = S.popup.siteBlocked(r.pattern, r.removed && typeof r.removed === 'object' ? Object.keys(r.removed).length : 0);
  const undo = document.createElement('button');
  undo.className = 'btn'; undo.id = 'toastUndo'; undo.textContent = S.popup.undo;
  undo.onclick = async () => { await send({ type: 'ghost:undo-forget-site', pattern: r.pattern, removed: r.removed }); t.textContent = S.popup.undone; refresh(); };
  t.appendChild(undo);
  setTimeout(() => { if (undo.isConnected) undo.remove(); }, 5000);
  refresh();
};

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
await refresh();

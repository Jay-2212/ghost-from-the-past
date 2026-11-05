import { timeAgo } from './lib/settings.js';
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
let st = null;
let tab = null;

function render() {
  const configured = st.configured;
  $('connect').hidden = configured;
  $('main').hidden = !configured;
  if (!configured) return;
  $('statusText').textContent = st.paused ? 'Paused' : 'Haunting';
  $('statusPill').classList.toggle('paused', st.paused);
  $('pauseBtn').textContent = st.paused ? 'Resume' : 'Pause';
  $('pauseBtn').setAttribute('aria-pressed', String(st.paused));
  $('today').textContent = st.pagesToday;
  $('queued').textContent = st.queued;
  const ls = $('lastSync');
  ls.classList.toggle('error', !!st.lastError);
  ls.textContent = st.lastError ? `Sync problem: ${st.lastError}` : `Last sync: ${timeAgo(st.lastSyncAt)}${st.lastSyncAt ? ` · ${st.lastSyncCount} page(s)` : ''}`;
  let host = '';
  try { host = tab && /^https?:/.test(tab.url) ? new URL(tab.url).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
  $('siteLine').textContent = host ? `This site: ${host}` : 'This page cannot be remembered.';
  $('forgetSite').disabled = !host;
}

async function refresh() {
  st = await send({ type: 'ghost:status' });
  render();
}

$('startSetup').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
$('settingsBtn').onclick = () => chrome.runtime.openOptionsPage();
$('pauseBtn').onclick = async () => { st = await send({ type: 'ghost:pause', paused: !st.paused }); render(); };
$('syncBtn').onclick = async () => {
  const b = $('syncBtn');
  b.disabled = true; b.textContent = 'Syncing…';
  await send({ type: 'ghost:sync' });
  b.disabled = false; b.textContent = 'Sync now';
  await refresh();
};
$('forgetSite').onclick = async () => {
  const r = await send({ type: 'ghost:forget-site', url: tab.url });
  if (!r || !r.ok) return;
  const t = $('siteToast');
  t.textContent = `Won't remember ${r.pattern}. Removed locally; ask your AI to "forget ${r.pattern}" to clear older memories. `;
  const undo = document.createElement('button');
  undo.className = 'btn'; undo.id = 'toastUndo'; undo.textContent = 'Undo';
  undo.onclick = async () => { await send({ type: 'ghost:undo-forget-site', pattern: r.pattern, removed: r.removed }); t.textContent = 'Undone.'; refresh(); };
  t.appendChild(undo);
  setTimeout(() => { if (undo.isConnected) undo.remove(); }, 5000);
  refresh();
};

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
await refresh();

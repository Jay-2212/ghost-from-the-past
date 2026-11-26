import { S } from './lib/strings.js';
import { getSettings, setSettings, defaultBlocklistText, timeAgo } from './lib/settings.js';
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
const say = (id, text) => { $(id).textContent = text; };
let revealed = false;

function snippet(url, secret, show) {
  const s = show ? secret : secret ? secret.slice(0, 4) + '…' + secret.slice(-4) : '<your secret>';
  return JSON.stringify({ mcpServers: { ghost: { url: `${url || 'https://YOUR-WORKER.workers.dev'}/mcp`, headers: { Authorization: `Bearer ${s}` } } } }, null, 2);
}

async function load() {
  const s = await getSettings();
  $('workerUrl').value = s.workerUrl;
  $('secret').value = s.secret;
  $('paused').checked = s.paused;
  $('redactEmails').checked = s.redactEmails !== false;
  $('minDwell').value = Math.round((s.minDwellMs ?? 5000) / 1000);
  $('blocklist').value = s.blocklist;
  $('mcpUrl').textContent = s.workerUrl ? `${s.workerUrl}/mcp` : 'Connect your Worker first';
  $('mcpSnippet').textContent = snippet(s.workerUrl, s.secret, revealed);
  await status();
}

async function status() {
  const st = await send({ type: 'ghost:status' });
  say('statusText', !st.configured ? S.options.notConnected : st.paused ? S.popup.paused : S.popup.remembering);
  $('statusPill').classList.toggle('paused', !st.configured || st.paused);
  say('syncLine', st.lastError ? S.popup.syncProblem(st.lastError) : S.options.syncLine(timeAgo(st.lastSyncAt), st.queued, st.totalSynced));
  const ul = $('recent');
  ul.textContent = '';
  if (!st.recent.length) {
    const li = document.createElement('li');
    const e = document.createElement('span'); e.className = 't muted'; e.textContent = S.options.recentEmpty;
    li.appendChild(e);
    ul.appendChild(li);
  }
  for (const r of st.recent) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 't'; t.textContent = r.title || r.url; t.title = r.url;
    const s = document.createElement('span'); s.className = 's'; s.textContent = `${r.synced ? S.options.recentSynced : S.options.recentQueued} · ${timeAgo(r.at)}`;
    li.append(t, s);
    ul.appendChild(li);
  }
}

$('showSecret').onclick = () => {
  const show = $('secret').type === 'password';
  $('secret').type = show ? 'text' : 'password';
  $('showSecret').textContent = show ? S.options.hide : S.options.show;
  $('showSecret').setAttribute('aria-label', show ? S.options.hideSecretLabel : S.options.showSecretLabel);
  $('showSecret').setAttribute('aria-pressed', String(show));
};
const copy = async (text, okId, okMsg) => {
  try { await navigator.clipboard.writeText(text); say(okId, okMsg); } catch { say(okId, S.err.copyFailed); }
};
$('copySecret').onclick = () => copy($('secret').value, 'connToast', S.options.secretCopied);
$('testConn').onclick = async () => {
  say('connToast', S.options.testing);
  const r = await send({ type: 'ghost:test', workerUrl: $('workerUrl').value, secret: $('secret').value.trim() });
  say('connToast', r.ok ? S.options.connected(r.pages) : r.error);
};
$('saveConn').onclick = async () => {
  say('connToast', S.options.testing);
  const r = await send({ type: 'ghost:connect', workerUrl: $('workerUrl').value, secret: $('secret').value.trim() });
  say('connToast', r.ok ? S.options.saved(r.pages) : r.error);
  if (r.ok) load();
};
$('copyMcp').onclick = async () => {
  const s = await getSettings();
  if (!s.workerUrl) return say('mcpToast', S.options.connectFirst);
  await copy(`${s.workerUrl}/mcp`, 'mcpToast', S.options.mcpCopied);
};
$('revealSnippet').onclick = async () => {
  revealed = !revealed;
  const s = await getSettings();
  $('mcpSnippet').textContent = snippet(s.workerUrl, s.secret, revealed);
  $('revealSnippet').textContent = revealed ? S.options.hideSnippet : S.options.revealSnippet;
  $('revealSnippet').setAttribute('aria-pressed', String(revealed));
};
$('copySnippet').onclick = async () => {
  const s = await getSettings();
  if (!s.workerUrl || !s.secret) return say('mcpToast', S.options.connectFirst);
  await copy(snippet(s.workerUrl, s.secret, true), 'mcpToast', S.options.snippetCopied);
};
$('savePrivacy').onclick = async () => {
  const secs = Math.max(0, Math.min(600, parseInt($('minDwell').value, 10) || 0));
  await setSettings({ paused: $('paused').checked, redactEmails: $('redactEmails').checked, minDwellMs: secs * 1000, blocklist: $('blocklist').value });
  await send({ type: 'ghost:settings-changed' });
  say('privToast', S.options.privSaved);
  status();
};
$('paused').onchange = async () => { await send({ type: 'ghost:pause', paused: $('paused').checked }); status(); };
$('resetBlocklist').onclick = () => { $('blocklist').value = defaultBlocklistText(); say('privToast', S.options.defaultsRestored); };
$('syncNow').onclick = async () => { say('recentToast', S.options.syncing); const r = await send({ type: 'ghost:sync' }); say('recentToast', r.ok ? S.options.synced(r.sent) : r.error); status(); };
$('clearQueue').onclick = async () => {
  if (!confirm(S.options.confirmClear)) return;
  await send({ type: 'ghost:clear-queue' });
  say('recentToast', S.options.queueCleared);
  status();
};
$('rerunSetup').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });

load();

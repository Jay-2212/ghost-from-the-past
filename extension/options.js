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
  say('statusText', !st.configured ? 'Not connected' : st.paused ? 'Paused' : 'Haunting');
  $('statusPill').classList.toggle('paused', !st.configured || st.paused);
  say('syncLine', st.lastError ? `Sync problem: ${st.lastError}` : `Last sync ${timeAgo(st.lastSyncAt)} · ${st.queued} waiting · ${st.totalSynced} sent`);
  const ul = $('recent');
  ul.textContent = '';
  if (!st.recent.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="t muted">Nothing yet. Read something!</span>';
    ul.appendChild(li);
  }
  for (const r of st.recent) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 't'; t.textContent = r.title || r.url; t.title = r.url;
    const s = document.createElement('span'); s.className = 's'; s.textContent = `${r.synced ? 'synced' : 'queued'} · ${timeAgo(r.at)}`;
    li.append(t, s);
    ul.appendChild(li);
  }
}

$('showSecret').onclick = () => {
  const show = $('secret').type === 'password';
  $('secret').type = show ? 'text' : 'password';
  $('showSecret').textContent = show ? 'Hide' : 'Show';
  $('showSecret').setAttribute('aria-pressed', String(show));
};
$('copySecret').onclick = async () => { await navigator.clipboard.writeText($('secret').value); say('connToast', 'Secret copied.'); };
$('testConn').onclick = async () => {
  say('connToast', 'Testing…');
  const r = await send({ type: 'ghost:test', workerUrl: $('workerUrl').value, secret: $('secret').value.trim() });
  say('connToast', r.ok ? `Connected · ${r.pages} page(s) remembered` : r.error);
};
$('saveConn').onclick = async () => {
  say('connToast', 'Testing…');
  const r = await send({ type: 'ghost:connect', workerUrl: $('workerUrl').value, secret: $('secret').value.trim() });
  say('connToast', r.ok ? `Saved · connected · ${r.pages} page(s) remembered` : r.error);
  if (r.ok) load();
};
$('copyMcp').onclick = async () => {
  const s = await getSettings();
  if (!s.workerUrl) return say('mcpToast', 'Connect your Worker first.');
  await navigator.clipboard.writeText(`${s.workerUrl}/mcp`);
  say('mcpToast', 'MCP URL copied.');
};
$('revealSnippet').onclick = async () => {
  revealed = !revealed;
  const s = await getSettings();
  $('mcpSnippet').textContent = snippet(s.workerUrl, s.secret, revealed);
  $('revealSnippet').textContent = revealed ? 'Hide secret' : 'Reveal secret';
  $('revealSnippet').setAttribute('aria-pressed', String(revealed));
};
$('copySnippet').onclick = async () => {
  const s = await getSettings();
  await navigator.clipboard.writeText(snippet(s.workerUrl, s.secret, true));
  say('mcpToast', 'Config copied (with your secret). Paste it into your MCP client settings.');
};
$('savePrivacy').onclick = async () => {
  const secs = Math.max(0, Math.min(600, parseInt($('minDwell').value, 10) || 0));
  await setSettings({ paused: $('paused').checked, redactEmails: $('redactEmails').checked, minDwellMs: secs * 1000, blocklist: $('blocklist').value });
  await send({ type: 'ghost:settings-changed' });
  say('privToast', 'Saved.');
  status();
};
$('paused').onchange = async () => { await send({ type: 'ghost:pause', paused: $('paused').checked }); status(); };
$('resetBlocklist').onclick = () => { $('blocklist').value = defaultBlocklistText(); say('privToast', 'Defaults restored. Press Save to keep them.'); };
$('syncNow').onclick = async () => { say('recentToast', 'Syncing…'); const r = await send({ type: 'ghost:sync' }); say('recentToast', r.ok ? `Synced ${r.sent} page(s).` : r.error); status(); };
$('clearQueue').onclick = async () => {
  if (!confirm('Forget everything that is waiting to sync? Memories already in your Worker stay there.')) return;
  await send({ type: 'ghost:clear-queue' });
  say('recentToast', 'Local queue cleared.');
  status();
};
$('rerunSetup').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });

load();

import { getSettings, DEPLOY_URL } from './lib/settings.js';
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);

function show(n) {
  for (const i of [1, 2, 3]) $(`s${i}`).hidden = i !== n;
  document.querySelectorAll('.dots li').forEach(li => {
    const k = Number(li.dataset.step);
    li.toggleAttribute('aria-current', k === n);
    if (k === n) li.setAttribute('aria-current', 'step');
    li.classList.toggle('done', k < n);
  });
  const f = $(`s${n}`).querySelector('button');
  if (f) f.focus();
}

async function ensureSecret() {
  const r = await send({ type: 'ghost:ensure-secret' });
  return r.secret;
}

async function connect(workerUrl, secret) {
  $('connToast').textContent = 'Checking your ghost…';
  const r = await send({ type: 'ghost:connect', workerUrl, secret, onboarded: true });
  if (!r.ok) { $('connToast').textContent = r.error; return false; }
  $('connToast').textContent = '';
  $('doneInfo').textContent = `Connected to ${r.url} · ${r.pages} page(s) remembered so far.`;
  show(3);
  return true;
}

async function checkOffer() {
  const { pendingOffer } = await chrome.storage.local.get('pendingOffer');
  if (!pendingOffer || Date.now() - pendingOffer.at > 30 * 60 * 1000) return;
  show(2);
  $('offerUrl').textContent = pendingOffer.workerUrl;
  $('offer').hidden = false;
  $('offerYes').focus();
}

$('iam').onclick = () => show(2);

let secretMasked = true;
let fullSecret = '';

function updateSecretDisplay() {
  if (secretMasked && fullSecret.length >= 8) {
    $('secretOut').textContent = fullSecret.slice(0, 4) + '…' + fullSecret.slice(-4);
  } else {
    $('secretOut').textContent = fullSecret;
  }
}

$('toggleSecret').onclick = () => {
  secretMasked = !secretMasked;
  $('toggleSecret').textContent = secretMasked ? 'Show' : 'Hide';
  $('toggleSecret').setAttribute('aria-pressed', secretMasked ? 'false' : 'true');
  updateSecretDisplay();
};

$('copySecret').onclick = async () => {
  await navigator.clipboard.writeText(fullSecret);
  $('deployToast').textContent = 'Secret copied.';
};
$('deploy').onclick = async () => {
  try { await navigator.clipboard.writeText(fullSecret); } catch { /* clipboard may be blocked; the Copy button still works */ }
  $('deployToast').textContent = 'Secret copied. Paste it into GHOST_SECRET on the Cloudflare page, then press Deploy there.';
  chrome.tabs.create({ url: DEPLOY_URL });
};
$('offerYes').onclick = async () => {
  const { pendingOffer } = await chrome.storage.local.get('pendingOffer');
  const s = await getSettings();
  if (pendingOffer) await connect(pendingOffer.workerUrl, s.secret);
};
$('offerNo').onclick = async () => {
  await chrome.storage.local.remove('pendingOffer');
  $('offer').hidden = true;
};
$('connectBtn').onclick = () => connect($('workerUrl').value, $('secretIn').value.trim());
$('openSettings').onclick = () => chrome.runtime.openOptionsPage();
$('closeTab').onclick = () => window.close();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pendingOffer && changes.pendingOffer.newValue) checkOffer();
});

const secret = await ensureSecret();
fullSecret = secret;
updateSecretDisplay();
$('secretIn').value = secret;
const s = await getSettings();
if (s.workerUrl) $('workerUrl').value = s.workerUrl;
if (location.hash === '#confirm') show(2);
await checkOffer();

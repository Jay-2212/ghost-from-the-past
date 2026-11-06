// Ghost from the Past — settings shared by background, popup, options and onboarding (ES module).
// Everything lives in chrome.storage.local: the secret must never sync, and the Worker URL belongs with it.
import './blocklist.js';

export const DEFAULTS = {
  workerUrl: '',
  secret: '',
  paused: false,
  minDwellMs: 5000,
  redactEmails: true,
  onboarded: false,
  blocklist: null, // null = defaults
};

export const DEPLOY_URL = 'https://deploy.workers.cloudflare.com/?url=https://github.com/Jay-2212/ghost-from-the-past/tree/main/worker';

export function defaultBlocklistText() {
  return globalThis.GhostBlocklist.defaultText();
}

export async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const out = { ...DEFAULTS, ...s };
  if (typeof out.blocklist !== 'string') out.blocklist = defaultBlocklistText();
  return out;
}

export async function setSettings(patch) {
  const clean = {};
  for (const k of Object.keys(patch)) if (k in DEFAULTS) clean[k] = patch[k];
  if (typeof clean.workerUrl === 'string') clean.workerUrl = normaliseWorkerUrl(clean.workerUrl);
  await chrome.storage.local.set(clean);
  return getSettings();
}

export function normaliseWorkerUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const p = new URL(u);
    return p.origin;
  } catch {
    return '';
  }
}

/** https only, except plain http for localhost/127.0.0.1 (local wrangler dev). */
export function isAcceptableWorkerUrl(u) {
  try {
    const p = new URL(u);
    if (p.protocol === 'https:') return true;
    return p.protocol === 'http:' && (p.hostname === 'localhost' || p.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function generateSecret() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export function newNonce() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export async function proofFor(secret, origin, nonce) {
  const encoder = new TextEncoder();
  const message = `ghost-verify:${origin}:${nonce}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  
  // Convert to lowercase hex
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function workerHost(s) {
  try {
    return s.workerUrl ? new URL(s.workerUrl).hostname : '';
  } catch {
    return '';
  }
}

export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

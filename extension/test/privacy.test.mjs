import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../lib/blocklist.js');
const R = require('../lib/redact.js');
const D = B.DEFAULT_BLOCKLIST;

test('default blocklist blocks sensitive categories', () => {
  const blocked = [
    'chrome://settings', 'file:///etc/passwd', 'http://localhost:3000/', 'http://192.168.1.1/admin', 'http://10.0.0.5/', 'http://172.20.1.1/',
    'http://nas/', 'https://printer.local/', 'https://accounts.google.com/signin', 'https://example.com/login', 'https://site.com/oauth/authorize?x',
    'https://mail.google.com/mail/u/0/#inbox', 'https://outlook.office.com/mail/', 'https://web.whatsapp.com/', 'https://discord.com/channels/1/2',
    'https://vault.bitwarden.com/#/vault', 'https://my.1password.com/', 'https://netbanking.hdfcbank.com/netbanking/', 'https://www.onlinesbi.sbi/',
    'https://www.icicibank.com/personal-banking', 'https://www.paypal.com/myaccount', 'https://pay.google.com/', 'https://paytm.com/', 'https://www.phonepe.com/',
    'https://shop.example.com/checkout/step2', 'https://kite.zerodha.com/dashboard', 'https://mychart.example.org/MyChart/', 'https://myaadhaar.uidai.gov.in/',
    'https://eportal.incometax.gov.in/iec/foservices/', 'https://www.irs.gov/account', 'https://www.digilocker.gov.in/', 'https://github.com/settings/tokens',
  ];
  for (const u of blocked) assert.ok(B.isBlocked(u, D), `should block ${u}`);
});

test('default blocklist allows ordinary reading', () => {
  const allowed = ['https://en.wikipedia.org/wiki/Ghost', 'https://developer.mozilla.org/en-US/docs/Web', 'https://github.com/Jay-2212/ghost-from-the-past',
    'https://www.youtube.com/watch?v=x', 'https://news.ycombinator.com/', 'https://www.reddit.com/r/Ghosts/comments/abc/x/', 'https://stackoverflow.com/questions/1/x',
    'https://www.amazon.in/dp/B000', 'https://example.com/blog/how-to-pick-a-password-manager'];
  for (const u of allowed) assert.equal(B.matchUrl(u, D), null, `should allow ${u}`);
});

test('user patterns, comments, extra hosts and site pattern', () => {
  const list = '# comment\nexample.org\n*.corp-wiki.io\nnews.site/private*\n';
  assert.ok(B.isBlocked('https://sub.example.org/a', list));
  assert.ok(B.isBlocked('https://x.corp-wiki.io/', list));
  assert.ok(B.isBlocked('https://news.site/private/1', list));
  assert.ok(!B.isBlocked('https://news.site/public/1', list));
  assert.ok(B.isBlocked('https://ghost.jay.workers.dev/', '', ['ghost.jay.workers.dev']));
  assert.equal(B.patternForSite('https://www.Example.com/a?b'), 'example.com');
  assert.ok(B.matchUrl('notaurl', list));
});

test('redaction: Luhn cards, secrets, ids, emails toggle', () => {
  const s = 'card 4111 1111 1111 1111 and 4111-1111-1111-1112 order 1234567890123456; key sk-proj-abcdefghijklmnopqrstuvwxyz123456 ghp_' + 'a'.repeat(36) +
    ' AKIAABCDEFGHIJKLMNOP jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U ssn 123-45-6789 mail me@ex.com';
  const out = R.redact(s);
  assert.match(out, /card \[redacted-card\]/);
  assert.match(out, /4111-1111-1111-1112/); // fails Luhn: kept
  assert.match(out, /order 1234567890123456/);
  assert.doesNotMatch(out, /sk-proj|ghp_a|AKIA|eyJhbGci|123-45-6789|me@ex\.com/);
  assert.match(R.redact('mail me@ex.com', { emails: false }), /me@ex\.com/);
  assert.match(R.redact('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'), /^\[redacted-secret\]$/);
});

test('redactPage covers title, excerpt and meta', () => {
  const p = R.redactPage({ title: 'me@ex.com', markdown: 'x 4111111111111111', excerpt: 'y', meta: { author: 'a@b.co' } });
  assert.equal(p.title, '[redacted-email]');
  assert.match(p.markdown, /\[redacted-card\]/);
  assert.equal(p.meta.author, '[redacted-email]');
});

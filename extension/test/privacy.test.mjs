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
    'https://docs.google.com/document/d/x/edit', 'https://drive.google.com/drive/my-drive', 'https://www.notion.so/acme/Plan-123',
    'https://acme.slack.com/archives/C1', 'https://acme.atlassian.net/wiki/x', 'https://chatgpt.com/c/1', 'https://claude.ai/chat/1', 'https://vault.zoho.com/',
  ];
  for (const u of blocked) assert.ok(B.isBlocked(u, D), `should block ${u}`);
});

test('default blocklist allows ordinary reading', () => {
  const allowed = ['https://en.wikipedia.org/wiki/Ghost', 'https://developer.mozilla.org/en-US/docs/Web', 'https://github.com/Jay-2212/ghost-from-the-past',
    'https://www.youtube.com/watch?v=x', 'https://news.ycombinator.com/', 'https://www.reddit.com/r/Ghosts/comments/abc/x/', 'https://stackoverflow.com/questions/1/x',
    'https://www.amazon.in/dp/B000', 'https://example.com/blog/how-to-pick-a-password-manager',
    'https://developers.google.com/maps', 'https://slack.com/help/articles/1', 'https://acme.notion.site/Public-page', 'https://www.dropbox.com/features'];
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

test('redactPage: recursive meta redaction', () => {
  const p = R.redactPage({ title: 'T', markdown: 'x', meta: { a: { b: ['card 4111111111111111'] } } });
  assert.equal(p.meta.a.b[0], 'card [redacted-card]');
});

test('redact: expanded secret patterns', () => {
  // Build fake tokens from string pieces so the repo never contains realistic literals
  const hf = 'h' + 'f' + '_' + 'a'.repeat(34);
  const npm = 'n' + 'pm' + '_' + 'a'.repeat(36);
  const ya29 = 'y' + 'a29.' + 'a'.repeat(24);
  const slack = 'ht' + 'tps://hooks.sl' + 'ack.com/services/T00/B00/xxx';
  const discord = 'ht' + 'tps://discord.com/api/webhooks/123/abc';
  const xapp = 'x' + 'app-' + 'a'.repeat(12);
  const sendgrid = 'S' + 'G.' + 'a'.repeat(20) + '.' + 'b'.repeat(20);
  const dopv1 = 'dop' + '_v1_' + 'a'.repeat(64);
  const shopify = 'sh' + 'pat_' + 'a'.repeat(32);
  const azureKey = 'Acc' + 'ountKey=' + 'abc+/='.repeat(10);
  
  assert.match(R.redact(hf), /^\[redacted-secret\]$/);
  assert.match(R.redact(npm), /^\[redacted-secret\]$/);
  assert.match(R.redact(ya29), /^\[redacted-secret\]$/);
  assert.match(R.redact(slack), /^\[redacted-secret\]$/);
  assert.match(R.redact(discord), /^\[redacted-secret\]$/);
  assert.match(R.redact(xapp), /^\[redacted-secret\]$/);
  assert.match(R.redact(sendgrid), /^\[redacted-secret\]$/);
  assert.match(R.redact(dopv1), /^\[redacted-secret\]$/);
  assert.match(R.redact(shopify), /^\[redacted-secret\]$/);
  assert.match(R.redact(azureKey), /^\[redacted-secret\]$/);
});

test('redact: prefixed secret names (AWS_SECRET_ACCESS_KEY=, API_TOKEN=)', () => {
  const v = 'wJalrXUt' + 'nFEMIK7MDENG' + 'bPxRfiCYzzzzzzzzzzzz';
  assert.equal(R.redact('AWS_SECRET_ACCESS_KEY=' + v), 'AWS_SECRET_ACCESS[redacted-secret]');
  assert.doesNotMatch(R.redact('export API_TOKEN="' + v + '"'), /wJalr/);
  assert.doesNotMatch(R.redact('DB_PASSWORD: ' + v), /wJalr/);
  assert.doesNotMatch(R.redact('MY_SECRET=' + v), /wJalr/);
  // a plain "key" in prose is not treated as a secret name
  assert.match(R.redact('primary key: user_id_and_created_at_ts'), /user_id_and_created_at_ts/);
});

test('blocklist: cloud consoles blocked by default', () => {
  assert.ok(B.isBlocked('https://console.aws.amazon.com/ec2/home', D));
  assert.ok(B.isBlocked('https://us-east-1.console.aws.amazon.com/s3/', D));
  assert.ok(B.isBlocked('https://portal.azure.com/#home', D));
  assert.ok(B.isBlocked('https://console.cloud.google.com/iam-admin', D));
  assert.equal(B.matchUrl('https://aws.amazon.com/blogs/aws/', D), null);
  assert.equal(B.matchUrl('https://cloud.google.com/run/docs', D), null);
});

test('hash-route SPAs blocked by path patterns', () => {
  // Hash routes like #/login should be blocked
  assert.ok(B.isBlocked('https://app.example.com/#/login', D), 'should block #/login');
  assert.ok(B.isBlocked('https://x.example.com/#!/checkout/pay', D), 'should block #!/checkout/pay');
  
  // Non-route hashes should behave as before
  const allowed1 = B.matchUrl('https://en.wikipedia.org/wiki/Ghost#History', D);
  assert.equal(allowed1, null, 'wikipedia with anchor should be allowed');
  
  // mail.google.com is in the default blocklist, should be blocked regardless of hash
  const blocked2 = B.isBlocked('https://mail.google.com/#inbox', D);
  assert.ok(blocked2, 'mail.google.com with #inbox should be blocked by domain pattern');
});

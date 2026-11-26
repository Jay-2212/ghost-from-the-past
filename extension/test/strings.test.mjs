import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../lib/strings.js';

// Every error must say what to do next: it has to contain an instruction verb.
const NEXT = /\b(check|try|open|paste|add|redeploy|press|reload|copy|connect|give it|select)\b/i;

test('every error message tells the user what to do next', () => {
  for (const [key, v] of Object.entries(S.err)) {
    const sample = typeof v === 'function' ? v(...Array(v.length).fill('x')) : v;
    assert.ok(typeof sample === 'string' && sample.length > 20, key);
    assert.match(sample, NEXT, `${key}: "${sample}"`);
  }
});

test('strings other tests and the e2e script rely on are stable', () => {
  assert.match(S.popup.lastSync('just now', 3), /^Last sync: just now · 3 page\(s\)$/);
  assert.match(S.popup.syncProblem('x'), /^Sync hiccup: x/);
  assert.match(S.options.connected(2), /^Connected/);
  assert.match(S.popup.siteBlocked('example.com', 0), /^Won't remember example\.com/);
});

test('guide hints are plain sentences and the not-configured one points to setup', () => {
  assert.match(S.guide.notConfigured, /connecting your Worker/);
  for (const v of Object.values(S.guide)) {
    const sample = typeof v === 'function' ? v(2) : v;
    assert.ok(sample.length > 10 && !/undefined|NaN/.test(sample));
  }
});

test('copy in a privacy tool may be spooky but never sounds like surveillance', () => {
  const bad = /watching you|spying|\bspy\b|stalk|tracking you|following you|i see everything/i;
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'object') walk(v, `${path}.${k}`);
      else {
        const sample = typeof v === 'function' ? v(...Array(v.length).fill(2)) : v;
        assert.doesNotMatch(String(sample), bad, `${path}.${k}: "${sample}"`);
      }
    }
  };
  walk(S, 'S');
});

test('siteBlocked has no trailing space and tolerates a bad count', () => {
  assert.equal(S.popup.siteBlocked('a.com', 2), S.popup.siteBlocked('a.com', 2).trim());
  assert.match(S.popup.siteBlocked('a.com', undefined), /0 local page\(s\) removed/);
});

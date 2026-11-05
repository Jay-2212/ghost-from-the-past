// Loads the extension's UMD libs into Node with jsdom documents.
const { JSDOM } = require('jsdom');
globalThis.Readability = require('@mozilla/readability').Readability;
globalThis.TurndownService = require('turndown');
const P = require('../lib/pipeline.js');
for (const n of ['youtube', 'reddit', 'x', 'github', 'wikipedia', 'stackexchange', 'product', 'docs', 'news']) require(`../lib/extractors/${n}.js`);
function dom(html, url) {
  return new JSDOM(html, { url }).window.document;
}
async function run(html, url, ctx) {
  return P.run(dom(html, url), url, Object.assign({ noNetwork: true, fetch: async () => ({ ok: false }) }, ctx));
}
const lorem = n => Array.from({ length: n }, (_, i) => `Sentence number ${i} talks about spectral apparitions and old houses in some detail.`).join(' ');
module.exports = { P, dom, run, lorem };

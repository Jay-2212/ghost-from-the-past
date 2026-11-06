// Lets `node --test extension/test` work on Node 22+, where the test runner no longer
// expands a directory argument: Node resolves the directory to this file, which loads
// every *.test.mjs next to it. `npm test` (node --test test/*.test.mjs) does not use it.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.mjs')).sort()) {
    await import(pathToFileURL(path.join(__dirname, f)).href);
  }
})();

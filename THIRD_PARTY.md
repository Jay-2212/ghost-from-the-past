# Third-Party Licenses

This project includes third-party open-source software:

## Vendor Dependencies

### Readability.js
- **Package**: [@mozilla/readability](https://github.com/mozilla/readability) v0.6.0
- **License**: Apache License 2.0
- **Copyright**: Copyright (c) 2010 Arc90 Inc
- **Location**: `extension/vendor/Readability.js`
- **Modifications**: None (vendored unmodified by `scripts/vendor.mjs`)

### Turndown
- **Package**: [turndown](https://github.com/mixmark-io/turndown) v7.2.5
- **License**: MIT
- **Copyright**: Copyright (c) 2017+ Dom Christie
- **Location**: `extension/vendor/turndown.js`
- **Modifications**: None (vendored unmodified by `scripts/vendor.mjs`)

## NPM Dependencies

See `worker/package.json` and `extension/package.json` for full dependency lists and licenses.

Key dependencies:
- **@modelcontextprotocol/sdk**: MIT (MCP server implementation)
- **@cloudflare/workers-types**: MIT/Apache-2.0 (TypeScript types)
- **zod**: MIT (schema validation)
- **vitest**: MIT (worker tests)
- **jsdom**: MIT (extension tests)
- **playwright**: Apache-2.0 (e2e tests)

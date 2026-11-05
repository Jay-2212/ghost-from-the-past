Continue "Ghost from the Past". Authoritative sources: docs/BRIEF.md, then .kiro/steering/*, then .kiro/specs/ghost-from-the-past/*.

PART A — apply these review fixes to the spec files first (short edits, keep files concise):
1. content.js is a CLASSIC content script (MV3 content scripts cannot be modules). Fix design.md/tech.md.
2. Workers AI bge-small returns {shape, data:number[][]}; Embedder must have embedBatch(texts:string[]):Promise<number[][]> (one AI call per page batch) plus embed(text).
3. VectorStore API: upsert(items:{id,pageId,values:number[]}[]), query(values, topK) -> {id,score}[], deleteByIds(ids:string[]). Fetch chunk ids from D1 BEFORE deleting pages so vectors can be deleted (no FK cascades needed).
4. Ingest never returns 409; statuses are created|merged|updated|skipped (see brief).
5. OPTIONS preflight is answered before auth. /mcp accepts ALL methods (POST; GET and DELETE return 405 JSON-RPC error in stateless mode).
6. settings: blocklist lives in chrome.storage.local (sync has an 8 KB per-item quota); the other small settings may stay in sync.
7. FTS5: order by bm25(chunks_fts) ASC (lower is better); build MATCH from the query by extracting word tokens [\p{L}\p{N}]+ (max 12), wrapping each in double quotes, joined with OR; empty -> skip FTS.
8. background onMessage listener returns true for async responses.
9. normaliseUrl also strips credential-like query params: token, access_token, auth, key, code, session, sid, password.
10. GET / serves a tiny HTML page when Accept includes text/html. Badge: cleared when haunting, text "off" with background #111 when paused.
11. Batches: extension sends <= 20 pages; Worker accepts <= 25.
12. Root package.json IS allowed but only for the e2e test devDependencies (playwright-core, @modelcontextprotocol/sdk) — no workspaces.
13. secret-guard.mjs: ignore *.example, *.md, .gitignore and test fixtures; only block real-looking values (e.g. GHOST_SECRET=<16+ non-placeholder chars>, a staged .dev.vars file, CLOUDFLARE_API_TOKEN=<value>). Hook matcher fields must be regex STRINGS (e.g. "matcher": "worker/src/.*\\.ts$"), not objects. Fix design-language.md front matter to a single block: inclusion: fileMatch, fileMatchPattern: ["extension/**/*.html","extension/**/*.css","extension/icons/**"].

PART B — implement tasks 1 to 5 in tasks.md (scaffolding + the whole worker incl. MCP) and tick them ([x]) as you finish. Requirements:
- worker/ is self-contained: package.json (name ghost-from-the-past-worker, "type":"module", scripts dev/test/typecheck/db:migrate:local/deploy as in the brief, "cloudflare":{"bindings":{"GHOST_SECRET":{"description":"…generate with `openssl rand -hex 32`…"}}}), tsconfig, wrangler.jsonc, .dev.vars.example, migrations/0001_init.sql.
- wrangler.jsonc: name "ghost-from-the-past", main "src/index.ts", compatibility_date "2026-11-01", compatibility_flags ["nodejs_compat"], d1_databases [{binding:"DB", database_name:"ghost-memory", database_id:"00000000-0000-0000-0000-000000000000", migrations_dir:"migrations"}], vectorize [{binding:"VECTORS", index_name:"ghost-memory"}], ai {binding:"AI"}, vars {EMBED_MODEL:"@cf/baai/bge-small-en-v1.5", MAX_CHUNKS_PER_PAGE:"8"}, observability enabled; env.local: same name suffix "-local", only the D1 binding (same database_name/id, migrations_dir) and vars {EMBED_MODE:"mock", VECTOR_MODE:"d1", EMBED_MODEL..., MAX_CHUNKS_PER_PAGE:"8"}.
- Dependencies: @modelcontextprotocol/sdk ^1.32, zod ^4, @cfworker/json-schema; dev: wrangler ^4, typescript ^5, vitest ^3, @cloudflare/workers-types. IMPORTANT: Workers forbid eval/new Function, so create the server with `new McpServer({name:'ghost-from-the-past',version}, {instructions, jsonSchemaValidator: new CfWorkerJsonSchemaValidator()})` importing from '@modelcontextprotocol/sdk/validation/cfworker-provider.js'. Transport: `new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true})` from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'; `await server.connect(transport); return transport.handleRequest(request)`. Use server.registerTool(name, {title, description, inputSchema: {zod shape}, annotations}, handler).
- Use D1 batch() for multi-statement writes. IDs: page id = first 16 hex chars of sha256(normalised url); chunk id = `${pageId}-${idx}` (< 64 bytes, valid Vectorize id).
- Unit tests (vitest, plain node environment, no workers pool needed) for chunk.ts, normaliseUrl, rrf, HashEmbedder, auth compare, and FTS query builder. Keep pure functions free of Cloudflare globals so they test in Node (crypto.subtle exists in Node 22).
- Verify with: cd worker && npm install && npx tsc --noEmit && npx vitest run && npx wrangler deploy --dry-run --outdir /tmp/ghost-dist. Fix until all pass. Do NOT start long-running servers (no wrangler dev) and do not deploy.
- Also create root LICENSE (MIT, "Copyright (c) 2026 Jay Bharti"), root .gitignore (node_modules/, .wrangler/, .dev.vars, *.log except docs/kiro-logs, dist/, shots/*.tmp; never .kiro), placeholder README.md and THIRD_PARTY.md.
Be economical: write each file once, carefully, rather than iterating. Print a short summary of what passes at the end.

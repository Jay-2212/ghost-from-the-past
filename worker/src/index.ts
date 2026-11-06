import { extractBearer, verifyBearer, verifyProof } from './auth';
import { VERSION, secretConfigured, type Env } from './env';
import { ingestPages, MAX_PAGES_PER_BATCH } from './ingest';
import { landingHtml } from './landing';
import { handleMcp } from './mcp';
import { ensureSchema } from './schema';
import { stats } from './search';

const MAX_BODY = 4 * 1024 * 1024;

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'access-control-expose-headers': 'Mcp-Session-Id',
  'access-control-max-age': '86400',
};

// /mcp responses to requests authenticated by ?token= get no CORS headers
const NO_CORS = new WeakSet<Response>();

function withCors(res: Response, path: string): Response {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff');
  
  // Only add CORS headers for browser-facing routes
  if (NO_CORS.has(res)) {
    // query-token auth: don't let other origins read the response
  } else if (path === '/mcp' || path === '/health' || path === '/' || path === 'OPTIONS') {
    for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  }
  
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function authorised(request: Request, env: Env, allowQuery: boolean): Promise<'header' | 'query' | null> {
  if (!secretConfigured(env)) return null;
  const header = request.headers.get('authorization');
  if (header && (await verifyBearer(header, env.GHOST_SECRET))) return 'header';
  if (allowQuery) {
    const token = new URL(request.url).searchParams.get('token');
    if (token && (await verifyBearer(`Bearer ${token}`, env.GHOST_SECRET))) return 'query';
  }
  return null;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    if (path === '/' && (request.headers.get('accept') ?? '').includes('text/html')) {
      return new Response(landingHtml(url.origin, VERSION), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
      });
    }
    return json({ ok: true, name: 'ghost-from-the-past', version: VERSION, configured: secretConfigured(env) });
  }

  if (!['/ingest', '/api/stats', '/api/verify', '/mcp'].includes(path)) return json({ error: 'not found' }, 404);
  
  // Rate limiting for sensitive routes (optional binding)
  if (env.LIMITER && ['/ingest', '/api/stats', '/api/verify', '/mcp'].includes(path)) {
    try {
      const ip = request.headers.get('cf-connecting-ip') ?? 'local';
      const { success } = await env.LIMITER.limit({ key: `${path}:${ip}` });
      if (!success) {
        return new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '60' }
        });
      }
    } catch (e) {
      // Limiter error: log but don't block the request
      console.error('rate limiter error', (e as Error)?.message);
    }
  }
  
  // /api/verify does not require auth (it must work before the client trusts the server)
  if (path === '/api/verify' && request.method === 'POST') {
    if (!secretConfigured(env)) {
      return json({ error: 'GHOST_SECRET is missing or too weak on this Worker. Set it in the Cloudflare dashboard (Workers & Pages > your Worker > Settings > Variables and Secrets, type Secret) to the value from the Ghost setup page.' }, 503);
    }
    
    const len = Number(request.headers.get('content-length') ?? '0');
    if (len > 1024) return json({ error: 'body too large' }, 413);
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: 'body too large' }, 413);
    
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    
    if (!body || typeof body.nonce !== 'string' || !/^[0-9a-f]{32,128}$/.test(body.nonce)) {
      return json({ error: 'nonce must be a hex string, 32-128 chars' }, 400);
    }
    
    const proof = await verifyProof(env.GHOST_SECRET!.trim(), url.origin, body.nonce);
    return json({ ok: true, proof });
  }
  
  if (!secretConfigured(env)) {
    return json({ error: 'GHOST_SECRET is missing or too weak on this Worker. Set it in the Cloudflare dashboard (Workers & Pages > your Worker > Settings > Variables and Secrets, type Secret) to the value from the Ghost setup page.' }, 503);
  }
  const via = await authorised(request, env, path === '/mcp' && env.ALLOW_QUERY_TOKEN === 'true');
  if (!via) {
    return new Response(JSON.stringify({ error: 'unauthorised' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="ghost-from-the-past"' },
    });
  }

  // Ensure schema exists before processing DB-touching routes
  await ensureSchema(env.DB);

  if (path === '/mcp') {
    const res = await handleMcp(request, env);
    if (via === 'query') NO_CORS.add(res);
    return res;
  }

  if (path === '/api/stats' && request.method === 'GET') return json({ ok: true, ...(await stats(env)) });

  if (path === '/ingest' && request.method === 'POST') {
    const len = Number(request.headers.get('content-length') ?? '0');
    if (len > MAX_BODY) return json({ error: 'body too large' }, 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'body too large' }, 413);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    if (!body || !Array.isArray(body.pages)) return json({ error: 'expected {pages: [...]}' }, 400);
    if (body.pages.length > MAX_PAGES_PER_BATCH) return json({ error: `at most ${MAX_PAGES_PER_BATCH} pages per request` }, 400);
    const results = await ingestPages(env, body.pages);
    return json({ ok: true, results });
  }

  return json({ error: 'method not allowed' }, 405);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      return withCors(await route(request, env), request.method === 'OPTIONS' ? 'OPTIONS' : path);
    } catch (e) {
      // Never log secrets or page content; message only.
      console.error('ghost error', (e as Error)?.message);
      return withCors(json({ error: 'internal error' }, 500), path);
    }
  },
} satisfies ExportedHandler<Env>;

export { extractBearer };

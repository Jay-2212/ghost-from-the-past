import { extractBearer, verifyBearer } from './auth';
import { VERSION, type Env } from './env';
import { ingestPages, MAX_PAGES_PER_BATCH } from './ingest';
import { landingHtml } from './landing';
import { handleMcp } from './mcp';
import { stats } from './search';

const MAX_BODY = 4 * 1024 * 1024;

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'access-control-expose-headers': 'Mcp-Session-Id',
  'access-control-max-age': '86400',
};

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  h.set('x-content-type-options', 'nosniff');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function authorised(request: Request, env: Env, allowQuery: boolean): Promise<boolean> {
  const header = request.headers.get('authorization');
  if (header && (await verifyBearer(header, env.GHOST_SECRET))) return true;
  if (allowQuery) {
    const token = new URL(request.url).searchParams.get('token');
    if (token && (await verifyBearer(`Bearer ${token}`, env.GHOST_SECRET))) return true;
  }
  return false;
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
    return json({ ok: true, name: 'ghost-from-the-past', version: VERSION, configured: Boolean(env.GHOST_SECRET) });
  }

  if (!['/ingest', '/api/stats', '/mcp'].includes(path)) return json({ error: 'not found' }, 404);
  if (!env.GHOST_SECRET) return json({ error: 'GHOST_SECRET is not set on this Worker. Run: npx wrangler secret put GHOST_SECRET' }, 503);
  if (!(await authorised(request, env, path === '/mcp'))) {
    return new Response(JSON.stringify({ error: 'unauthorised' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="ghost-from-the-past"' },
    });
  }

  if (path === '/mcp') return handleMcp(request, env);

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
    try {
      return withCors(await route(request, env));
    } catch (e) {
      // Never log secrets or page content; message only.
      console.error('ghost error', (e as Error)?.message);
      return withCors(json({ error: 'internal error' }, 500));
    }
  },
} satisfies ExportedHandler<Env>;

export { extractBearer };

// Landing page served at GET / (Accept: text/html). Never shows the secret or any memory.
export const GHOST_SVG = `<svg viewBox="0 0 128 128" width="96" height="96" aria-hidden="true"><rect x="6" y="6" width="116" height="116" rx="34" fill="#fff" stroke="#111" stroke-width="4"/><path d="M64 22c-19 0-32 15-32 35v33c0 3 2 5 5 4l6-3 6 5c2 2 4 2 6 0l5-5 4 5c2 2 4 2 6 0l4-5 5 5c2 2 4 2 6 0l6-5 6 3c3 1 5-1 5-4V57c0-20-13-35-32-35z" fill="#111"/><ellipse cx="53" cy="56" rx="5.5" ry="7.5" fill="#fff"/><ellipse cx="75" cy="56" rx="5.5" ry="7.5" fill="#fff"/></svg>`;

export function landingHtml(origin: string, version: string): string {
  const mcp = `${origin}/mcp`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="ghost-from-the-past" content="worker">
<meta name="robots" content="noindex">
<title>Your ghost is alive · Ghost from the Past</title>
<style>
:root{--bg:#F7F5F0;--ink:#111}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:16px/1.5 -apple-system,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif}
.card{width:min(560px,92vw);background:#fff;border:1.5px solid var(--ink);border-radius:28px;padding:36px;text-align:center}
h1{font-size:28px;margin:16px 0 8px;letter-spacing:-.02em}p{margin:8px 0;color:#333}
button,.btn{font:inherit;font-weight:600;cursor:pointer;background:var(--bg);color:var(--ink);border:1.5px solid var(--ink);border-radius:999px;padding:12px 22px;margin-top:16px}
button:hover{background:var(--ink);color:var(--bg)}button:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
code{display:block;word-break:break-all;background:var(--bg);border:1.5px solid var(--ink);border-radius:14px;padding:10px 12px;margin-top:8px;font-size:14px}
.small{font-size:13px;color:#555}#status{min-height:1.5em;font-weight:600}
@media (prefers-reduced-motion:no-preference){svg{animation:float 3s ease-in-out infinite}@keyframes float{50%{transform:translateY(-6px)}}}
</style></head><body><main class="card">
${GHOST_SVG}
<h1>Your ghost is alive</h1>
<p>This is your private Ghost from the Past. It lives only in your Cloudflare account and remembers the pages your browser extension sends it.</p>
<button id="connect" type="button">Connect to extension</button>
<p id="status" role="status" aria-live="polite"></p>
<p class="small">No extension yet? Install it, then open its setup and paste this address:</p>
<code id="origin">${origin}</code>
<p class="small" style="margin-top:18px">MCP server for your AI (Claude, Kiro, Cursor…), with header <b>Authorization: Bearer &lt;your secret&gt;</b>:</p>
<code>${mcp}</code>
<p class="small">v${version} · <a href="https://github.com/Jay-2212/ghost-from-the-past">github.com/Jay-2212/ghost-from-the-past</a></p>
</main>
<script>
document.getElementById('connect').addEventListener('click', function () {
  var s = document.getElementById('status');
  window.postMessage({ source: 'ghost-worker', type: 'connect' }, location.origin);
  s.textContent = 'Calling your extension…';
  setTimeout(function () {
    if (document.documentElement.dataset.ghostConnect === 'sent') s.textContent = 'Sent! Switch back to the extension tab and confirm.';
    else s.textContent = 'The extension did not answer. Make sure it is installed, or paste the address above into its setup.';
  }, 1200);
});
</script></body></html>`;
}

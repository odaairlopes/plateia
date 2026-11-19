// Serves the production web build (dist-web) the way Vercel does, so the
// end-to-end tests run against the exact artifact that is deployed:
//
//   /api/*   proxied to the backend gateway (same origin: no CORS, and the
//            back-office cookie keeps SameSite=Strict)
//   files    served from dist-web
//   else     index.html (client-side routes such as /events/:id/seats)
//
//   node e2e/serve.mjs   (E2E_PORT, default 4173; E2E_API_URL, default http://localhost:8080)
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist-web/', import.meta.url));
const port = Number(process.env.E2E_PORT ?? 4173);
const api = new URL(process.env.E2E_API_URL ?? 'http://localhost:8080');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

try {
  await stat(path.join(root, 'index.html'));
} catch {
  console.error('dist-web/index.html not found. Build the site first: npm run build:web:prod');
  process.exit(1);
}

function proxy(request, response) {
  const upstream = http.request(
    {
      host: api.hostname,
      port: api.port || 80,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: api.host },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response); // streams SSE untouched
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'BAD_GATEWAY', message: 'Backend unavailable' }));
  });
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
}

/** Resolves a URL path inside dist-web; null when it escapes the root or is not a file. */
async function fileFor(urlPath) {
  const resolved = path.resolve(root, `.${decodeURIComponent(urlPath)}`);
  if (!resolved.startsWith(root)) return null;
  try {
    return (await stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

async function handle(request, response) {
  const urlPath = (request.url ?? '/').split('?')[0] ?? '/';
  if (urlPath.startsWith('/api/')) return proxy(request, response);

  const file = (await fileFor(urlPath)) ?? path.join(root, 'index.html');
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(response);
}

// node:http ignores the promise a handler returns: a rejection would go unhandled.
const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'INTERNAL', message: 'Unexpected error' }));
  });
});

server.listen(port, '127.0.0.1', () => console.log(`e2e site on http://localhost:${port} -> api ${api.origin}`));

// Single public entry point for the services that run inside the container.
//
//   /api/catalog/*    -> catalog-service
//   /api/booking/*    -> booking-service (includes the SSE seat stream)
//   /api/backoffice/* -> backoffice-service
//   /health           -> ready only when every service is ready
//
// Payment and notification have no public API: they only consume events.
// Plain node:http so responses stream through untouched (SSE never buffers).
import http from 'node:http';

const routes = {
  catalog: Number(process.env.CATALOG_PORT ?? 3001),
  booking: Number(process.env.BOOKING_PORT ?? 3002),
  backoffice: Number(process.env.BACKOFFICE_PORT ?? 3005),
};
const internalPorts = [3001, 3002, 3003, 3004, 3005].map(String).map((fallback, index) => {
  const names = ['CATALOG_PORT', 'BOOKING_PORT', 'PAYMENT_PORT', 'NOTIFICATION_PORT', 'BACKOFFICE_PORT'];
  return Number(process.env[names[index]] ?? fallback);
});

const ROUTE = /^\/api\/(catalog|booking|backoffice)(\/.*)?$/;

async function allReady() {
  const checks = await Promise.all(
    internalPorts.map((port) =>
      fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(2000) })
        .then((response) => response.ok)
        .catch(() => false),
    ),
  );
  return checks.every(Boolean);
}

function proxy(request, response, port, path) {
  const forwardedFor = [request.headers['x-forwarded-for'], request.socket.remoteAddress].filter(Boolean).join(', ');
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port,
      method: request.method,
      path,
      headers: { ...request.headers, 'x-forwarded-for': forwardedFor },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'BAD_GATEWAY', message: 'Service unavailable' }));
  });
  // A client that disconnects (e.g. leaves the seat map) closes the upstream stream too.
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
}

const server = http.createServer(async (request, response) => {
  const url = request.url ?? '/';
  if (url === '/health' || url === '/') {
    const ready = await allReady();
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: ready ? 'ok' : 'starting' }));
    return;
  }
  const match = ROUTE.exec(url.split('?')[0] ?? '');
  if (!match) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found' }));
    return;
  }
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  proxy(request, response, routes[match[1]], `${match[2] ?? '/'}${query}`);
});

// SSE connections stay open for minutes: no request or keep-alive timeout.
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.keepAliveTimeout = 65_000;

const port = Number(process.env.PORT ?? 8080);
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ msg: 'gateway listening', port })));

export { server };

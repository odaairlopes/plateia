// Container entrypoint: runs the five services as separate processes plus the
// gateway, which is the only thing listening on the public port.
//
// One container is a hosting compromise (the free tier allows one web
// service); the services stay isolated processes with their own schema, pool
// and lifecycle, exactly as they would run as separate deployments.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const services = [
  ['catalog', 'CATALOG_PORT', 3001],
  ['booking', 'BOOKING_PORT', 3002],
  ['payment', 'PAYMENT_PORT', 3003],
  ['notification', 'NOTIFICATION_PORT', 3004],
  ['backoffice', 'BACKOFFICE_PORT', 3005],
];
// Each service is a small Node process; a heap cap keeps five of them inside a 512 MB instance.
const heapMb = process.env.SERVICE_HEAP_MB ?? '80';

const children = [];
let stopping = false;

function run(name, args, env = {}) {
  const child = spawn(process.execPath, [`--max-old-space-size=${heapMb}`, ...args], {
    cwd: here,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    // Let the platform restart the whole container rather than limp along.
    console.error(JSON.stringify({ msg: 'process exited, stopping container', name, code, signal }));
    shutdown(1);
  });
  children.push(child);
  return child;
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 8000).unref();
  Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve)))).then(() =>
    process.exit(code),
  );
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

async function waitReady(port) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const ok = await fetch(`http://127.0.0.1:${port}/health/ready`)
      .then((response) => response.ok)
      .catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`service on port ${port} did not become ready`);
}

// Start the gateway first so the platform sees the port open (health stays 503 until ready).
run('gateway', ['gateway.mjs']);

// Catalog first: booking and the back office read it.
for (const [name, portVar, port] of services) {
  run(name, [`${name}/bin/main.mjs`], { [portVar]: String(process.env[portVar] ?? port) });
  if (name === 'catalog') await waitReady(port);
}
await Promise.all(services.map(([, , port]) => waitReady(port)));
console.log(JSON.stringify({ msg: 'all services ready' }));

// Optional demo data on a fresh database (idempotent: skips if already seeded).
if (process.env.SEED_DEMO_ON_START === 'true') {
  const seed = spawn(process.execPath, ['seed-demo.mjs'], { cwd: here, env: process.env, stdio: 'inherit' });
  seed.on('exit', (code) => console.log(JSON.stringify({ msg: 'demo seed finished', code })));
}

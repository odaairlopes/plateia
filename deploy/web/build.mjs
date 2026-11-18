// Production build of the web apps as ONE static site (one Vercel project):
//
//   /               shell (host)
//   /mf/catalog/    catalog remote
//   /mf/booking/    booking remote
//   /mf/admin/      back-office remote
//   /api/*          proxied to the backend by vercel.json (same origin)
//
// Same origin matters: the back-office session cookie is SameSite=Strict,
// which a browser only sends to the site's own domain.
//
//   node deploy/web/build.mjs   ->  dist-web/
import { execFileSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'dist-web');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const remotes = ['catalog', 'booking', 'admin'];

// Relative URLs: the browser calls the site's own /api, never the backend host directly.
const shared = {
  VITE_CATALOG_API_URL: '/api/catalog',
  VITE_BOOKING_API_URL: '/api/booking',
  VITE_BACKOFFICE_API_URL: '/api/backoffice',
};

function build(workspace, env) {
  console.log(`building ${workspace}`);
  execFileSync(npm, ['run', 'build', '-w', workspace], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...shared, ...env },
    shell: process.platform === 'win32',
  });
}

await rm(out, { recursive: true, force: true });

for (const remote of remotes) {
  build(`@plateia/mfe-${remote}`, { VITE_BASE: `/mf/${remote}/` });
}
build('@plateia/shell', {
  VITE_REMOTE_CATALOG_URL: '/mf/catalog',
  VITE_REMOTE_BOOKING_URL: '/mf/booking',
  VITE_REMOTE_ADMIN_URL: '/mf/admin',
});

await cp(path.join(root, 'apps', 'shell', 'dist'), out, { recursive: true });
for (const remote of remotes) {
  await cp(path.join(root, 'apps', `mfe-${remote}`, 'dist'), path.join(out, 'mf', remote), { recursive: true });
}
console.log(`done -> ${path.relative(root, out)}`);

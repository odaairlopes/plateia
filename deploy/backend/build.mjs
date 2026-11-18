// Bundles each service (and the demo seed) into plain JavaScript for production.
//
// Workspace packages (@plateia/*) are TypeScript source, so they are bundled
// in. Everything else stays an external import resolved from node_modules at
// runtime: native addons (argon2), packages that read their own files
// (swagger-ui) and instrumentation that patches modules must not be inlined.
//
//   node deploy/backend/build.mjs   ->  deploy-dist/
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'deploy-dist');
const services = ['catalog', 'booking', 'payment', 'notification', 'backoffice'];

const externalizeDependencies = {
  name: 'externalize-dependencies',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
      // Entry points and absolute paths (C:\... on Windows) are ours, not packages.
      if (args.kind === 'entry-point' || path.isAbsolute(args.path)) return undefined;
      return args.path.startsWith('@plateia/') ? undefined : { path: args.path, external: true };
    });
  },
};

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'warning',
  plugins: [externalizeDependencies],
  // The notification email template is TSX.
  jsx: 'automatic',
};

await rm(out, { recursive: true, force: true });

for (const service of services) {
  const serviceDir = path.join(root, 'services', service);
  // bin/main.mjs + ../migrations: the same relative layout the source uses.
  await build({
    ...common,
    entryPoints: [path.join(serviceDir, 'src', 'main.ts')],
    outfile: path.join(out, service, 'bin', 'main.mjs'),
  });
  await mkdir(path.join(out, service), { recursive: true });
  await cp(path.join(serviceDir, 'migrations'), path.join(out, service, 'migrations'), { recursive: true });
  console.log(`built ${service}`);
}

await build({
  ...common,
  entryPoints: [path.join(root, 'scripts', 'seed-demo.ts')],
  outfile: path.join(out, 'seed-demo.mjs'),
});
await cp(path.join(root, 'deploy', 'backend', 'start.mjs'), path.join(out, 'start.mjs'));
await cp(path.join(root, 'deploy', 'backend', 'gateway.mjs'), path.join(out, 'gateway.mjs'));
console.log(`done -> ${path.relative(root, out)}`);

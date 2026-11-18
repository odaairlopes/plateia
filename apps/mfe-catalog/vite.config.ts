import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { ports, sharedDependencies } from '../../tooling/federation.ts';

export default defineConfig({
  envDir: '../../',
  // Where the remote is served in production (deploy/web/build.mjs), e.g. /mf/catalog/.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    federation({
      name: 'catalog',
      filename: 'remoteEntry.js',
      exposes: {
        './EventsPage': './src/pages/EventsPage.tsx',
        './EventDetailPage': './src/pages/EventDetailPage.tsx',
      },
      shared: sharedDependencies,
      dts: false,
    }),
  ],
  server: { port: ports.catalog, strictPort: true, origin: `http://localhost:${ports.catalog}` },
  preview: { port: ports.catalog, strictPort: true },
  build: { target: 'esnext' },
});

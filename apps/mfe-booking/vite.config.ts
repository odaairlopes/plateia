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
      name: 'booking',
      filename: 'remoteEntry.js',
      exposes: {
        './SeatSelectionPage': './src/pages/SeatSelectionPage.tsx',
        './OrderPage': './src/pages/OrderPage.tsx',
      },
      shared: sharedDependencies,
      dts: false,
    }),
  ],
  server: { port: ports.booking, strictPort: true, origin: `http://localhost:${ports.booking}` },
  preview: { port: ports.booking, strictPort: true },
  build: { target: 'esnext' },
});

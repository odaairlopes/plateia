import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { ports, sharedDependencies } from '../../tooling/federation.ts';

export default defineConfig({
  envDir: '../../',
  plugins: [
    react(),
    federation({
      name: 'admin',
      filename: 'remoteEntry.js',
      // One entry point: the whole back office. Its code (and ECharts) is only
      // downloaded when someone opens /admin, never by ticket buyers.
      exposes: { './AdminApp': './src/AdminApp.tsx' },
      shared: sharedDependencies,
      dts: false,
    }),
  ],
  server: { port: ports.admin, strictPort: true, origin: `http://localhost:${ports.admin}` },
  preview: { port: ports.admin, strictPort: true },
  build: { target: 'esnext' },
});

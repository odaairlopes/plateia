import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { ports, sharedDependencies } from '../../tooling/federation.ts';

const ENV_DIR = '../../';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, 'VITE_');
  const remoteEntry = (url: string | undefined, port: number) =>
    `${url ?? `http://localhost:${port}`}/remoteEntry.js`;

  return {
    envDir: ENV_DIR,
    plugins: [
      react(),
      federation({
        name: 'shell',
        // Remote locations are deploy-time configuration: each micro frontend
        // can be released on its own without rebuilding the shell.
        remotes: {
          catalog: {
            type: 'module',
            name: 'catalog',
            entry: remoteEntry(env.VITE_REMOTE_CATALOG_URL, ports.catalog),
          },
          booking: {
            type: 'module',
            name: 'booking',
            entry: remoteEntry(env.VITE_REMOTE_BOOKING_URL, ports.booking),
          },
        },
        shared: sharedDependencies,
        dts: false,
      }),
    ],
    server: { port: ports.shell, strictPort: true },
    build: { target: 'esnext' },
  };
});

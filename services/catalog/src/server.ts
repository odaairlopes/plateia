import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { baseEnvSchema, buildApp, createPool, loadEnv, onShutdown, runMigrations } from '@plateia/platform';
import { shutdownTelemetry } from '@plateia/platform/telemetry';
import { createCatalogRepository } from './repository';
import { registerCatalogRoutes } from './routes';

const env = loadEnv(baseEnvSchema.extend({ CATALOG_PORT: z.coerce.number().int().default(3001) }));

const pool = createPool(env.DATABASE_URL);

const app = await buildApp({
  name: 'catalog-service',
  description: 'Read model of events, venues and seating sections.',
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS,
  ready: async () => {
    await pool.query('SELECT 1');
  },
});

const applied = await runMigrations(pool, 'catalog', fileURLToPath(new URL('../migrations', import.meta.url)));
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

registerCatalogRoutes(app, createCatalogRepository(pool));

onShutdown(app.log, [() => app.close(), () => pool.end(), shutdownTelemetry]);

await app.listen({ port: env.CATALOG_PORT, host: '0.0.0.0' });

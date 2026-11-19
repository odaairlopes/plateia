import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import {
  baseEnvSchema,
  buildApp,
  createHttpCatalogClient,
  createPool,
  createRedisEventBus,
  loadEnv,
  onShutdown,
  runMigrations,
} from '@plateia/platform';
import { shutdownTelemetry } from '@plateia/platform/telemetry';
import { makeCurrentOrganizer, makeGetDashboard, makeLogin, makeSalesProjector } from './application/use-cases';
import { registerBackofficeRoutes, SESSION_COOKIE } from './http/routes';
import { createPgOrganizerRepository, createPgSalesProjection, createPgSalesReadModel } from './infra/pg-backoffice';

const DEV_JWT_SECRET = 'plateia-dev-only-secret-change-me-in-production';

const env = loadEnv(
  baseEnvSchema.extend({
    BACKOFFICE_PORT: z.coerce.number().int().default(3005),
    CATALOG_URL: z.url().default('http://localhost:3001'),
    BACKOFFICE_JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  }),
);

// Fail fast rather than sign production sessions with a secret that is in the repository.
if (env.NODE_ENV === 'production' && env.BACKOFFICE_JWT_SECRET === DEV_JWT_SECRET) {
  throw new Error('BACKOFFICE_JWT_SECRET must be set in production');
}

const pool = createPool(env.DATABASE_URL);

const app = await buildApp({
  name: 'backoffice-service',
  description: 'Organizer sign-in and sales reporting.',
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS,
  corsCredentials: true,
  ready: async () => {
    await pool.query('SELECT 1');
  },
});

await app.register(cookie);
await app.register(jwt, {
  secret: env.BACKOFFICE_JWT_SECRET,
  cookie: { cookieName: SESSION_COOKIE, signed: false },
});

const applied = await runMigrations(pool, 'backoffice', fileURLToPath(new URL('../migrations', import.meta.url)));
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

const organizers = createPgOrganizerRepository(pool);

registerBackofficeRoutes(app, {
  login: makeLogin({
    organizers,
    hasher: { verify: (passwordHash, password) => verify(passwordHash, password) },
    dummyHash: await hash('timing-equalizer'),
  }),
  currentOrganizer: makeCurrentOrganizer(organizers),
  getDashboard: makeGetDashboard({
    organizers,
    catalog: createHttpCatalogClient(env.CATALOG_URL),
    sales: createPgSalesReadModel(pool),
    clock: () => new Date(),
  }),
  secureCookies: env.NODE_ENV === 'production',
});

const bus = createRedisEventBus(env.REDIS_URL, app.log);
await bus.subscribe({
  group: 'backoffice',
  consumer: `${hostname()}-${process.pid}`,
  // A projection is rebuilt from history: a new group reads the stream from the start.
  startFrom: 'beginning',
  handlers: makeSalesProjector(createPgSalesProjection(pool)),
});

onShutdown(app.log, [() => app.close(), () => bus.close(), () => pool.end(), shutdownTelemetry]);

await app.listen({ port: env.BACKOFFICE_PORT, host: '0.0.0.0' });

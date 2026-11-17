import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  baseEnvSchema,
  buildApp,
  createPool,
  createRedisEventBus,
  loadEnv,
  onShutdown,
  runMigrations,
  startOutboxRelay,
} from '@plateia/platform';
import { shutdownTelemetry } from '@plateia/platform/telemetry';
import { makePaymentHandlers } from './handlers';
import { createPgPaymentRepository } from './pg-payment-repository';

const env = loadEnv(
  baseEnvSchema.extend({
    PAYMENT_PORT: z.coerce.number().int().default(3003),
    PAYMENT_DELAY_MS: z.coerce.number().int().min(0).default(1500),
  }),
);

const pool = createPool(env.DATABASE_URL);

// This service has no business HTTP API: it only reacts to events.
// The HTTP server exists for health probes.
const app = await buildApp({
  name: 'payment-service',
  description: 'Simulated payment provider driven by domain events.',
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS,
  ready: async () => {
    await pool.query('SELECT 1');
  },
});

const applied = await runMigrations(pool, 'payment', fileURLToPath(new URL('../migrations', import.meta.url)));
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

const bus = createRedisEventBus(env.REDIS_URL, app.log);
const relay = startOutboxRelay(pool, 'payment', bus, app.log);

await bus.subscribe({
  group: 'payment',
  consumer: `${hostname()}-${process.pid}`,
  handlers: makePaymentHandlers({
    payments: createPgPaymentRepository(pool),
    newId: randomUUID,
    simulateProvider: () => sleep(env.PAYMENT_DELAY_MS),
  }),
});

onShutdown(app.log, [() => app.close(), () => bus.close(), () => relay.stop(), () => pool.end(), shutdownTelemetry]);

await app.listen({ port: env.PAYMENT_PORT, host: '0.0.0.0' });

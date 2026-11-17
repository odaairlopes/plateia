import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
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
  startOutboxRelay,
} from '@plateia/platform';
import { shutdownTelemetry } from '@plateia/platform/telemetry';
import { makeCreateOrder } from './application/create-order';
import { makeHoldSeats, makeReleaseHold } from './application/hold-seats';
import type { Clock } from './application/ports';
import { makeSettleOrder } from './application/settle-order';
import { registerBookingRoutes } from './http/routes';
import { countHolds, countOrders, seatStreamGauge } from './infra/metrics';
import { createPgOrderRepository } from './infra/pg-order-repository';
import { createRedisHoldStore } from './infra/redis-hold-store';
import { createSeatBroadcaster } from './infra/seat-broadcaster';

// Composition root: the only place that knows which implementation backs each port.

const env = loadEnv(
  baseEnvSchema.extend({
    BOOKING_PORT: z.coerce.number().int().default(3002),
    CATALOG_URL: z.url().default('http://localhost:3001'),
    HOLD_TTL_SECONDS: z.coerce.number().int().min(10).default(300),
    PAYMENT_WINDOW_SECONDS: z.coerce.number().int().min(10).default(120),
    ORDER_EXPIRY_SECONDS: z.coerce.number().int().min(30).default(300),
  }),
);

const pool = createPool(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);

const app = await buildApp({
  name: 'booking-service',
  description: 'Seat holds, orders and the checkout saga.',
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS,
  ready: async () => {
    await Promise.all([pool.query('SELECT 1'), redis.ping()]);
  },
});

const applied = await runMigrations(pool, 'booking', fileURLToPath(new URL('../migrations', import.meta.url)));
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

const clock: Clock = { now: () => new Date() };
const holds = createRedisHoldStore(redis);
const orders = createPgOrderRepository(pool);
const broadcaster = createSeatBroadcaster(env.REDIS_URL, app.log);
const bus = createRedisEventBus(env.REDIS_URL, app.log);

const settle = makeSettleOrder({ orders, holds, notifier: broadcaster });

registerBookingRoutes(app, {
  holds,
  orders,
  broadcaster,
  streamGauge: seatStreamGauge,
  holdSeats: countHolds(
    makeHoldSeats({
      catalog: createHttpCatalogClient(env.CATALOG_URL),
      holds,
      orders,
      notifier: broadcaster,
      clock,
      newId: randomUUID,
      holdTtlMs: env.HOLD_TTL_SECONDS * 1000,
    }),
  ),
  releaseHold: makeReleaseHold({ holds, notifier: broadcaster }),
  createOrder: countOrders(
    makeCreateOrder({
      holds,
      orders,
      clock,
      newId: randomUUID,
      paymentWindowMs: env.PAYMENT_WINDOW_SECONDS * 1000,
    }),
  ),
});

const relay = startOutboxRelay(pool, 'booking', bus, app.log);

await bus.subscribe({
  group: 'booking',
  consumer: `${hostname()}-${process.pid}`,
  handlers: {
    'payment.succeeded': (event) => settle.onPaymentSucceeded(event.payload.orderId),
    'payment.failed': (event) => settle.onPaymentFailed(event.payload.orderId),
  },
});

const sweeper = setInterval(() => {
  settle
    .expireStaleOrders(clock, env.ORDER_EXPIRY_SECONDS * 1000)
    .then((expired) => {
      if (expired > 0) app.log.info({ expired }, 'stale orders expired');
    })
    .catch((error: unknown) => app.log.error({ err: error }, 'order sweeper failed'));
}, 30_000);

onShutdown(app.log, [
  async () => clearInterval(sweeper),
  () => app.close(),
  () => bus.close(),
  () => relay.stop(),
  () => broadcaster.close(),
  async () => redis.disconnect(),
  () => pool.end(),
  shutdownTelemetry,
]);

await app.listen({ port: env.BOOKING_PORT, host: '0.0.0.0' });

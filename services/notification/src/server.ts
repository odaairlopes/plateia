import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { metrics } from '@opentelemetry/api';
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
import { makeSendOrderConfirmation } from './application/send-order-confirmation';
import { createPgNotificationLog } from './infra/pg-notification-log';
import { createSmtpMailer } from './infra/smtp-mailer';

const env = loadEnv(
  baseEnvSchema.extend({
    NOTIFICATION_PORT: z.coerce.number().int().default(3004),
    CATALOG_URL: z.url().default('http://localhost:3001'),
    APP_URL: z.url().default('http://localhost:5173'),
    // Defaults point at Mailpit (docker compose): emails are captured locally, never delivered.
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('Plateia <ingressos@plateia.dev>'),
  }),
);

const pool = createPool(env.DATABASE_URL);
const mailer = createSmtpMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  from: env.MAIL_FROM,
});

// No business HTTP API: the service only reacts to events. HTTP is for health probes.
const app = await buildApp({
  name: 'notification-service',
  description: 'Sends transactional emails in reaction to domain events.',
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS,
  ready: async () => {
    await pool.query('SELECT 1');
  },
});

const applied = await runMigrations(pool, 'notification', fileURLToPath(new URL('../migrations', import.meta.url)));
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

// SMTP being down is not fatal: sends fail, the bus retries and dead-letters.
mailer
  .verify()
  .then(() => app.log.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP server reachable'))
  .catch((error: unknown) => app.log.warn({ err: error, host: env.SMTP_HOST }, 'SMTP server not reachable yet'));

const emailsCounter = metrics.getMeter('plateia.notification').createCounter('plateia.emails', {
  description: 'Confirmation emails by outcome (sent, skipped_duplicate, failed)',
});

const sendOrderConfirmation = makeSendOrderConfirmation({
  catalog: createHttpCatalogClient(env.CATALOG_URL),
  mailer,
  log: createPgNotificationLog(pool),
  appUrl: env.APP_URL,
  onOutcome: (outcome) => emailsCounter.add(1, { kind: 'order_confirmed', outcome }),
});

const bus = createRedisEventBus(env.REDIS_URL, app.log);
await bus.subscribe({
  group: 'notification',
  consumer: `${hostname()}-${process.pid}`,
  // Never replay history: that would email every past customer again.
  startFrom: 'latest',
  handlers: {
    'order.confirmed': async (event) => {
      const outcome = await sendOrderConfirmation(event);
      app.log.info({ orderId: event.payload.orderId, outcome }, 'order confirmation email');
    },
  },
});

onShutdown(app.log, [
  () => app.close(),
  () => bus.close(),
  async () => mailer.close(),
  () => pool.end(),
  shutdownTelemetry,
]);

await app.listen({ port: env.NOTIFICATION_PORT, host: '0.0.0.0' });

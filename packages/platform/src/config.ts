import { z } from 'zod';

/** Settings every service needs. Defaults match docker-compose.yml (dev only). */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().default('postgres://plateia:plateia@localhost:5433/plateia'),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

/**
 * Infrastructure knobs shared by every service. Development defaults; a
 * deployment tunes them through the environment without touching services.
 */
const platformSettingsSchema = z.object({
  /** Connections per service. Small in production: managed Postgres limits total connections. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  /**
   * Proxies in front of the service (CDN, gateway...). Needed for the real
   * client IP, which rate limiting depends on. Counting hops instead of
   * trusting every X-Forwarded-For entry keeps clients from spoofing it.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Approximate cap on the event stream, so Redis memory stays bounded. */
  EVENT_STREAM_MAXLEN: z.coerce.number().int().min(1000).default(100_000),
});

let platformSettings: z.infer<typeof platformSettingsSchema> | undefined;

export function getPlatformSettings(): z.infer<typeof platformSettingsSchema> {
  platformSettings ??= loadEnv(platformSettingsSchema);
  return platformSettings;
}

/**
 * Validates the environment once at startup and fails fast with a readable
 * message, instead of letting a missing variable surface as a runtime bug.
 */
export function loadEnv<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

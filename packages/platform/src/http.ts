import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { SESSION_HEADER, type Problem } from '@plateia/contracts';
import { DomainError } from './errors';
import { traceLogFields } from './tracing';

export interface BuildAppOptions {
  name: string;
  description: string;
  logLevel: string;
  corsOrigins: string[];
  /** Allow browsers to send cookies cross-origin (session-cookie APIs only). */
  corsCredentials?: boolean;
  /** Readiness probe: resolves when the dependencies are reachable. */
  ready?: () => Promise<void>;
}

/**
 * One place for the cross-cutting HTTP concerns, so every service behaves the
 * same: Zod validation in and out, a single error format, CORS restricted to
 * known origins, rate limiting, request ids, OpenAPI docs and health probes.
 */
export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    // Every log line carries the ids of the trace it belongs to.
    logger: { level: options.logLevel, base: { service: options.name }, mixin: traceLogFields },
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: options.corsOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', SESSION_HEADER, 'x-request-id'],
    credentials: options.corsCredentials ?? false,
    maxAge: 600,
  });

  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: { info: { title: options.name, description: options.description, version: '0.1.0' } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof DomainError) {
      const body: Problem = { code: error.code, message: error.message, details: error.details };
      return reply.status(error.status).send(body);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: Problem = {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation.map((issue) => ({ path: issue.instancePath, message: issue.message })),
      };
      return reply.status(400).send(body);
    }
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : 'Request error';
      const body: Problem = { code: statusCode === 429 ? 'RATE_LIMITED' : 'REQUEST_ERROR', message };
      return reply.status(statusCode).send(body);
    }
    // Unexpected: log everything, leak nothing.
    request.log.error({ err: error }, 'unhandled error');
    const body: Problem = { code: 'INTERNAL_ERROR', message: 'Internal server error' };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: Problem = { code: 'NOT_FOUND', message: 'Route not found' };
    return reply.status(404).send(body);
  });

  app.get('/health/live', { schema: { hide: true } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { schema: { hide: true } }, async (_request, reply) => {
    try {
      await options.ready?.();
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

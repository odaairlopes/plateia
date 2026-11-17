import { register } from 'node:module';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * OpenTelemetry bootstrap. It is a separate entry point (`@plateia/platform/telemetry`)
 * on purpose: instrumentation works by patching libraries as they are loaded,
 * so this must run before Fastify, pg or ioredis are imported. Each service's
 * `main.ts` starts telemetry first and only then imports the real server.
 *
 * Everything is exported over OTLP to a collector. The service does not know
 * (or care) whether traces end up in Jaeger and metrics in Prometheus — that
 * is the collector's configuration, changeable without redeploying services.
 *
 * Standard env vars apply: OTEL_EXPORTER_OTLP_ENDPOINT (default
 * http://localhost:4318) and OTEL_SDK_DISABLED=true to turn it off. With no
 * collector running, exports fail silently and the service is unaffected.
 */

let sdk: NodeSDK | undefined;

const isProbe = (url: string | undefined) => url?.startsWith('/health') === true || url?.startsWith('/docs') === true;

export function startTelemetry(serviceName: string): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true') return;

  // Libraries imported as ES modules (ioredis here) are only patchable through
  // a module hook, and only if it is registered before they are loaded — which
  // is why the dev/start scripts preload this file with `node --import`.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        'service.name': serviceName,
        'service.namespace': 'plateia',
        'deployment.environment.name': process.env.NODE_ENV ?? 'development',
      }),
    ),
    // No host/process auto-detection: it would attach the PID, command line,
    // OS user and hostname to every metric — unbounded label cardinality and
    // machine details nobody asked to publish.
    resourceDetectors: [],
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 10_000),
      }),
    ],
    instrumentations: [
      // Health probes would bury the real traffic in noise.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (request) => isProbe(request.url) }),
      new UndiciInstrumentation(), // outgoing fetch(), e.g. booking -> catalog
      // Background loops (outbox relay, stream consumer) poll constantly;
      // only queries that belong to a request or an event are worth a span.
      new PgInstrumentation({ requireParentSpan: true }),
      new IORedisInstrumentation({ requireParentSpan: true }),
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        ignorePaths: ({ url }) => isProbe(url),
      }),
    ],
  });

  sdk.start();
}

/** Flushes pending spans and metrics; call it last during graceful shutdown. */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown().catch(() => undefined);
  sdk = undefined;
}

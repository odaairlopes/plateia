import { context, propagation, ROOT_CONTEXT, trace, type Context } from '@opentelemetry/api';

/**
 * Trace context helpers built on the OpenTelemetry *API* only. The API is a
 * no-op until an SDK is started, so this code costs nothing in unit tests and
 * never requires telemetry to be configured.
 */

/** W3C trace context (`traceparent`, `tracestate`) as plain key/values. */
export type TraceCarrier = Record<string, string>;

export const tracer = trace.getTracer('plateia.platform');

/** Serializes the active trace so it can travel inside a database row or a message. */
export function captureTraceContext(from: Context = context.active()): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(from, carrier);
  return carrier;
}

/** Rebuilds the context captured by `captureTraceContext`, possibly in another process. */
export function restoreTraceContext(carrier: TraceCarrier | null | undefined): Context {
  return carrier ? propagation.extract(ROOT_CONTEXT, carrier) : ROOT_CONTEXT;
}

/** Fields that tie a log line to its trace, for jumping from logs to the trace view. */
export function traceLogFields(): { trace_id?: string; span_id?: string } {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext ? { trace_id: spanContext.traceId, span_id: spanContext.spanId } : {};
}

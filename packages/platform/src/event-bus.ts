import { context, metrics, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { Redis } from 'ioredis';
import { domainEventSchema, type DomainEvent, type DomainEventType, type EventOf } from '@plateia/contracts';
import { captureTraceContext, restoreTraceContext, tracer, type TraceCarrier } from './tracing';

export type EventHandlers = {
  [T in DomainEventType]?: (event: EventOf<T>) => Promise<void>;
};

export interface Subscription {
  stop(): Promise<void>;
}

export interface EventBus {
  /**
   * `traceContext` is the context captured when the event was created (see the
   * outbox). Without it the event starts from whatever span is active now.
   */
  publish(event: DomainEvent, traceContext?: TraceCarrier | null): Promise<void>;
  subscribe(options: SubscribeOptions): Promise<Subscription>;
}

export interface SubscribeOptions {
  /** Consumer group: one per service, so every service sees every event once. */
  group: string;
  /** Unique name of this process inside the group. */
  consumer: string;
  handlers: EventHandlers;
  /**
   * Where a brand-new group starts reading. 'beginning' (default) replays the
   * stream history, right for consumers that rebuild state. A consumer with
   * external side effects, such as sending email, must use 'latest': replaying
   * history would e-mail every past customer again.
   */
  startFrom?: 'beginning' | 'latest';
}

export interface BusLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export const EVENT_STREAM = 'plateia:events';
export const DEAD_LETTER_STREAM = 'plateia:events:dead-letter';

const MAX_ATTEMPTS = 3;
const BLOCK_MS = 2_000;
const CLAIM_IDLE_MS = 30_000;

type StreamEntry = [id: string, fields: string[]];
type Outcome = 'ok' | 'failed' | 'dead_letter';

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

const meter = metrics.getMeter('plateia.event-bus');
const publishedCounter = meter.createCounter('plateia.events.published', {
  description: 'Domain events published to the bus',
});
const consumedCounter = meter.createCounter('plateia.events.consumed', {
  description: 'Handler executions by outcome (a retried event counts once per attempt)',
});
const processingDuration = meter.createHistogram('plateia.events.processing.duration', {
  description: 'Time a handler takes to process one event',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS },
});
const deliveryLag = meter.createHistogram('plateia.events.delivery.lag', {
  description: 'Time between an event happening and its handler starting (outbox + broker + queueing)',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS },
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function fieldValue(fields: string[], name: string): string | undefined {
  const index = fields.indexOf(name);
  return index === -1 ? undefined : fields[index + 1];
}

function parseCarrier(raw: string | undefined): TraceCarrier | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TraceCarrier;
  } catch {
    return null;
  }
}

const messagingAttributes = (event: DomainEvent) => ({
  'messaging.system': 'redis',
  'messaging.destination.name': EVENT_STREAM,
  'messaging.message.id': event.id,
  'plateia.event.type': event.type,
});

/**
 * Event bus on Redis Streams with consumer groups.
 *
 * Delivery is at-least-once: an entry is acknowledged only after its handler
 * succeeds, so handlers must be idempotent. A failing entry is retried with
 * backoff and then parked in a dead-letter stream instead of blocking the
 * group forever. Entries left pending by a crashed consumer are reclaimed.
 *
 * Observability: every message carries its W3C trace context, so a publish
 * and the handlers it triggers in other services belong to one trace.
 */
export function createRedisEventBus(redisUrl: string, logger: BusLogger): EventBus & { close(): Promise<void> } {
  const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const subscriptions: Subscription[] = [];

  /** Runs the handler once inside a consumer span and records its metrics. */
  async function runHandler(
    handler: (event: DomainEvent) => Promise<void>,
    event: DomainEvent,
    carrier: TraceCarrier | null,
    group: string,
    attempt: number,
  ): Promise<boolean> {
    const labels = { 'event.type': event.type, 'consumer.group': group };
    const startedAt = performance.now();
    if (attempt === 1) {
      deliveryLag.record(Math.max(0, Date.now() - Date.parse(event.occurredAt)) / 1000, labels);
    }

    const span = tracer.startSpan(
      `process ${event.type}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          ...messagingAttributes(event),
          'messaging.operation.type': 'process',
          'messaging.consumer.group.name': group,
          'plateia.event.attempt': attempt,
        },
      },
      restoreTraceContext(carrier),
    );

    let outcome: Outcome = 'ok';
    try {
      await context.with(trace.setSpan(restoreTraceContext(carrier), span), () => handler(event));
      return true;
    } catch (error) {
      outcome = attempt < MAX_ATTEMPTS ? 'failed' : 'dead_letter';
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      logger.warn({ err: error, eventType: event.type, eventId: event.id, attempt }, 'event handler failed');
      return false;
    } finally {
      span.end();
      consumedCounter.add(1, { ...labels, outcome });
      processingDuration.record((performance.now() - startedAt) / 1000, labels);
    }
  }

  async function handleEntry(reader: Redis, options: SubscribeOptions, [id, fields]: StreamEntry): Promise<void> {
    const raw = fieldValue(fields, 'event');
    let parsed: DomainEvent | undefined;
    try {
      parsed = domainEventSchema.parse(JSON.parse(raw ?? 'null'));
    } catch (error) {
      await deadLetter(id, raw, `invalid envelope: ${String(error)}`, options.group);
      await reader.xack(EVENT_STREAM, options.group, id);
      return;
    }

    const handler = options.handlers[parsed.type] as ((event: DomainEvent) => Promise<void>) | undefined;
    if (!handler) {
      await reader.xack(EVENT_STREAM, options.group, id);
      return;
    }

    const carrier = parseCarrier(fieldValue(fields, 'trace'));
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (await runHandler(handler, parsed, carrier, options.group, attempt)) {
        await reader.xack(EVENT_STREAM, options.group, id);
        return;
      }
      if (attempt < MAX_ATTEMPTS) await sleep(200 * 2 ** attempt);
    }

    await deadLetter(id, raw, 'handler failed after retries', options.group);
    await reader.xack(EVENT_STREAM, options.group, id);
  }

  async function deadLetter(id: string, raw: string | undefined, reason: string, group: string): Promise<void> {
    logger.error({ entryId: id, group, reason }, 'event moved to dead-letter stream');
    await publisher.xadd(DEAD_LETTER_STREAM, '*', 'event', raw ?? '', 'reason', reason, 'group', group, 'entryId', id);
  }

  return {
    async publish(event, traceContext) {
      const parent = traceContext ? restoreTraceContext(traceContext) : context.active();
      const span = tracer.startSpan(
        `publish ${event.type}`,
        { kind: SpanKind.PRODUCER, attributes: { ...messagingAttributes(event), 'messaging.operation.type': 'send' } },
        parent,
      );
      try {
        const carrier = captureTraceContext(trace.setSpan(parent, span));
        await publisher.xadd(EVENT_STREAM, '*', 'event', JSON.stringify(event), 'trace', JSON.stringify(carrier));
        publishedCounter.add(1, { 'event.type': event.type });
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },

    async subscribe(options) {
      // Blocking reads need their own connection.
      const reader = new Redis(redisUrl, { maxRetriesPerRequest: null });
      try {
        const startId = options.startFrom === 'latest' ? '$' : '0';
        await reader.xgroup('CREATE', EVENT_STREAM, options.group, startId, 'MKSTREAM');
      } catch (error) {
        if (!(error instanceof Error && error.message.includes('BUSYGROUP'))) throw error;
      }

      let running = true;
      let lastClaim = 0;

      const loop = (async () => {
        while (running) {
          try {
            if (Date.now() - lastClaim > CLAIM_IDLE_MS) {
              lastClaim = Date.now();
              const claimed = (await reader.xautoclaim(
                EVENT_STREAM,
                options.group,
                options.consumer,
                CLAIM_IDLE_MS,
                '0',
                'COUNT',
                20,
              )) as [next: string, entries: StreamEntry[]];
              for (const entry of claimed[1]) await handleEntry(reader, options, entry);
            }

            const batch = (await reader.xreadgroup(
              'GROUP',
              options.group,
              options.consumer,
              'COUNT',
              10,
              'BLOCK',
              BLOCK_MS,
              'STREAMS',
              EVENT_STREAM,
              '>',
            )) as [stream: string, entries: StreamEntry[]][] | null;

            for (const [, entries] of batch ?? []) {
              for (const entry of entries) await handleEntry(reader, options, entry);
            }
          } catch (error) {
            if (!running) break;
            logger.error({ err: error, group: options.group }, 'event consumer loop error');
            await sleep(1_000);
          }
        }
      })();

      const subscription: Subscription = {
        async stop() {
          running = false;
          reader.disconnect();
          await loop;
        },
      };
      subscriptions.push(subscription);
      logger.info({ group: options.group, events: Object.keys(options.handlers) }, 'event subscription started');
      return subscription;
    },

    async close() {
      await Promise.all(subscriptions.map((subscription) => subscription.stop()));
      publisher.disconnect();
    },
  };
}

import type { DomainEvent } from '@plateia/contracts';
import { assertSchemaName, withTransaction, type Pool, type Queryable } from './db';
import type { BusLogger, EventBus } from './event-bus';
import { captureTraceContext, type TraceCarrier } from './tracing';

/**
 * Transactional outbox.
 *
 * A service never writes to its database and publishes to the broker as two
 * separate steps (one could succeed and the other fail). Instead the event is
 * stored in the same transaction as the state change, and a relay publishes it
 * afterwards. The result is at-least-once delivery with no lost events.
 *
 * The relay runs outside any request, so the trace would normally end at the
 * INSERT. The trace context is therefore stored next to the event and handed
 * to the bus on publish, keeping one trace from the HTTP request all the way
 * to the consumers in other services.
 */

/**
 * Call inside the transaction that changes the aggregate.
 * The `<schema>.outbox` table is created by each service's own migration.
 */
export async function enqueueOutbox(db: Queryable, schemaName: string, event: DomainEvent): Promise<void> {
  const schema = assertSchemaName(schemaName);
  await db.query(`INSERT INTO ${schema}.outbox (event, trace_context) VALUES ($1, $2)`, [
    JSON.stringify(event),
    JSON.stringify(captureTraceContext()),
  ]);
}

export interface OutboxRelay {
  stop(): Promise<void>;
}

interface OutboxRow {
  seq: string;
  event: DomainEvent;
  trace_context: TraceCarrier | null;
}

export function startOutboxRelay(
  pool: Pool,
  schemaName: string,
  bus: EventBus,
  logger: BusLogger,
  intervalMs = 250,
): OutboxRelay {
  const schema = assertSchemaName(schemaName);
  let running = true;

  async function drain(): Promise<number> {
    return withTransaction(pool, async (client) => {
      // SKIP LOCKED lets several replicas relay concurrently without duplicates.
      const { rows } = await client.query<OutboxRow>(
        `SELECT seq, event, trace_context FROM ${schema}.outbox
          WHERE published_at IS NULL
          ORDER BY seq
          LIMIT 50
          FOR UPDATE SKIP LOCKED`,
      );
      for (const row of rows) await bus.publish(row.event, row.trace_context);
      if (rows.length > 0) {
        await client.query(`UPDATE ${schema}.outbox SET published_at = now() WHERE seq = ANY($1::bigint[])`, [
          rows.map((row) => row.seq),
        ]);
      }
      return rows.length;
    });
  }

  const loop = (async () => {
    while (running) {
      try {
        const published = await drain();
        if (published > 0) continue;
      } catch (error) {
        logger.error({ err: error, schema }, 'outbox relay error');
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  })();

  return {
    async stop() {
      running = false;
      await loop;
    },
  };
}

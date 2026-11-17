import type { CancelReason, DomainEvent, OrderStatus } from '@plateia/contracts';
import { enqueueOutbox, withTransaction, type Pool, type Queryable } from '@plateia/platform';
import type { OrderRepository, OrderTransaction } from '../application/ports';
import type { Order } from '../domain/order';

const SCHEMA = 'booking';

interface OrderRow {
  id: string;
  hold_id: string;
  session_id: string;
  event_id: string;
  seat_ids: string[];
  total_cents: number;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  cancel_reason: CancelReason | null;
  created_at: Date;
}

const COLUMNS =
  'id, hold_id, session_id, event_id, seat_ids, total_cents, customer_name, customer_email, status, cancel_reason, created_at';

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    holdId: row.hold_id,
    sessionId: row.session_id,
    eventId: row.event_id,
    seatIds: row.seat_ids,
    totalCents: row.total_cents,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    status: row.status,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
  };
}

async function findOne(db: Queryable, where: string, value: string): Promise<Order | null> {
  const { rows } = await db.query<OrderRow>(`SELECT ${COLUMNS} FROM booking.orders WHERE ${where}`, [value]);
  return rows[0] ? toOrder(rows[0]) : null;
}

function createTransaction(db: Queryable): OrderTransaction {
  return {
    findForUpdate: (orderId) => findOne(db, 'id = $1 FOR UPDATE', orderId),

    async claimSeats(order) {
      const inserted = await db.query(
        `INSERT INTO booking.tickets (event_id, seat_id, order_id)
         SELECT $1, unnest($2::text[]), $3
         ON CONFLICT (event_id, seat_id) DO NOTHING`,
        [order.eventId, order.seatIds, order.id],
      );
      if (inserted.rowCount === order.seatIds.length) return true;
      // Partial claim: give back what was taken, the order will be cancelled.
      await db.query('DELETE FROM booking.tickets WHERE order_id = $1', [order.id]);
      return false;
    },

    async save(order) {
      await db.query(
        'UPDATE booking.orders SET status = $2, cancel_reason = $3, updated_at = now() WHERE id = $1',
        [order.id, order.status, order.cancelReason],
      );
    },

    enqueue: (event: DomainEvent) => enqueueOutbox(db, SCHEMA, event),
  };
}

export function createPgOrderRepository(pool: Pool): OrderRepository {
  return {
    async createPending(order, event) {
      return withTransaction(pool, async (client) => {
        const inserted = await client.query<OrderRow>(
          `INSERT INTO booking.orders
             (id, hold_id, session_id, event_id, seat_ids, total_cents, customer_name, customer_email, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (hold_id) DO NOTHING
           RETURNING ${COLUMNS}`,
          [
            order.id,
            order.holdId,
            order.sessionId,
            order.eventId,
            order.seatIds,
            order.totalCents,
            order.customerName,
            order.customerEmail,
            order.status,
            order.createdAt,
          ],
        );
        const row = inserted.rows[0];
        if (row) {
          await enqueueOutbox(client, SCHEMA, event);
          return toOrder(row);
        }
        // Lost a race against an identical request: return the winner's order.
        const existing = await findOne(client, 'hold_id = $1', order.holdId);
        if (!existing) throw new Error(`Order for hold ${order.holdId} vanished`);
        return existing;
      });
    },

    findById: (orderId) => findOne(pool, 'id = $1', orderId),
    findByHoldId: (holdId) => findOne(pool, 'hold_id = $1', holdId),

    async findSoldSeats(eventId, seatIds) {
      const { rows } = seatIds
        ? await pool.query<{ seat_id: string }>(
            'SELECT seat_id FROM booking.tickets WHERE event_id = $1 AND seat_id = ANY($2::text[])',
            [eventId, seatIds],
          )
        : await pool.query<{ seat_id: string }>('SELECT seat_id FROM booking.tickets WHERE event_id = $1', [
            eventId,
          ]);
      return rows.map((row) => row.seat_id);
    },

    async findStalePendingIds(createdBefore) {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM booking.orders
          WHERE status = 'pending_payment' AND created_at < $1
          ORDER BY created_at LIMIT 100`,
        [createdBefore],
      );
      return rows.map((row) => row.id);
    },

    transaction: (work) => withTransaction(pool, (client) => work(createTransaction(client))),
  };
}

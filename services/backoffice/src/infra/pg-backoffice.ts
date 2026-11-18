import { withTransaction, type Pool } from '@plateia/platform';
import type {
  Outcome,
  OrganizerAccount,
  OrganizerRepository,
  SalesAggregates,
  SalesProjection,
  SalesReadModel,
} from '../application/ports';

interface OrganizerRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}

const toAccount = (row: OrganizerRow): OrganizerAccount => ({
  id: row.id,
  name: row.name,
  email: row.email,
  passwordHash: row.password_hash,
});

export function createPgOrganizerRepository(pool: Pool): OrganizerRepository {
  return {
    async findByEmail(email) {
      const { rows } = await pool.query<OrganizerRow>(
        'SELECT id, name, email, password_hash FROM backoffice.organizers WHERE email = $1',
        [email],
      );
      return rows[0] ? toAccount(rows[0]) : null;
    },
    async findById(id) {
      const { rows } = await pool.query<OrganizerRow>(
        'SELECT id, name, email, password_hash FROM backoffice.organizers WHERE id = $1',
        [id],
      );
      return rows[0] ? toAccount(rows[0]) : null;
    },
    async ownedEventIds(organizerId) {
      const { rows } = await pool.query<{ event_id: string }>(
        'SELECT event_id FROM backoffice.organizer_events WHERE organizer_id = $1 ORDER BY event_id',
        [organizerId],
      );
      return rows.map((row) => row.event_id);
    },
  };
}

export function createPgSalesProjection(pool: Pool): SalesProjection {
  return {
    async recordCreated(order) {
      await pool.query(
        `INSERT INTO backoffice.orders (order_id, event_id, status, seat_ids, total_cents, created_at)
         VALUES ($1, $2, 'pending', $3, $4, $5)
         ON CONFLICT (order_id) DO NOTHING`,
        [order.orderId, order.eventId, order.seatIds, order.totalCents, order.at],
      );
    },

    async recordConfirmed(order) {
      await withTransaction(pool, async (client) => {
        // Upsert: works whether or not order.created was seen first.
        await client.query(
          `INSERT INTO backoffice.orders
             (order_id, event_id, status, seat_ids, total_cents, customer_name, customer_email_masked, created_at, settled_at)
           VALUES ($1, $2, 'confirmed', $3, $4, $5, $6, $7, $7)
           ON CONFLICT (order_id) DO UPDATE SET
             status = 'confirmed',
             cancel_reason = NULL,
             seat_ids = EXCLUDED.seat_ids,
             total_cents = EXCLUDED.total_cents,
             customer_name = EXCLUDED.customer_name,
             customer_email_masked = EXCLUDED.customer_email_masked,
             settled_at = EXCLUDED.settled_at`,
          [
            order.orderId,
            order.eventId,
            order.seatIds,
            order.totalCents,
            order.customerName,
            order.customerEmailMasked,
            order.at,
          ],
        );
        await client.query(
          `INSERT INTO backoffice.order_seats (order_id, event_id, seat_id, section_id)
           SELECT $1, $2, seat_id, split_part(seat_id, ':', 1) FROM unnest($3::text[]) AS seat_id
           ON CONFLICT DO NOTHING`,
          [order.orderId, order.eventId, order.seatIds],
        );
      });
    },

    async recordCancelled(order) {
      // A confirmed order is never cancelled by booking; the guard keeps a
      // late or repeated cancellation from overwriting a sale.
      await pool.query(
        `UPDATE backoffice.orders
            SET status = 'cancelled', cancel_reason = $2, settled_at = COALESCE(settled_at, $3)
          WHERE order_id = $1 AND status <> 'confirmed'`,
        [order.orderId, order.reason, order.at],
      );
    },
  };
}

const num = (value: string | number | null) => Number(value ?? 0);

export function createPgSalesReadModel(pool: Pool): SalesReadModel {
  return {
    async aggregate({ eventIds, from, timeZone }): Promise<SalesAggregates> {
      // $1 events, $2 period start (nullable), $3 time zone. Shared by every query.
      const params = [eventIds, from, timeZone];
      const confirmedInPeriod = `status = 'confirmed' AND event_id = ANY($1)
        AND ($2::timestamptz IS NULL OR settled_at >= $2::timestamptz) AND $3::text IS NOT NULL`;

      const [totals, outcomes, byDay, byEvent, bySection, heatmap, recent] = await Promise.all([
        pool.query<{ revenue: string; orders: string; tickets: string }>(
          `SELECT COALESCE(SUM(total_cents), 0) AS revenue, COUNT(*) AS orders,
                  COALESCE(SUM(cardinality(seat_ids)), 0) AS tickets
             FROM backoffice.orders WHERE ${confirmedInPeriod}`,
          params,
        ),
        pool.query<{ outcome: Outcome; orders: string }>(
          `SELECT COALESCE(cancel_reason, 'confirmed') AS outcome, COUNT(*) AS orders
             FROM backoffice.orders
            WHERE status IN ('confirmed', 'cancelled') AND event_id = ANY($1)
              AND ($2::timestamptz IS NULL OR settled_at >= $2::timestamptz) AND $3::text IS NOT NULL
            GROUP BY 1`,
          params,
        ),
        pool.query<{ date: string; revenue: string; tickets: string }>(
          `SELECT to_char(settled_at AT TIME ZONE $3, 'YYYY-MM-DD') AS date,
                  SUM(total_cents) AS revenue, SUM(cardinality(seat_ids)) AS tickets
             FROM backoffice.orders WHERE ${confirmedInPeriod}
            GROUP BY 1 ORDER BY 1`,
          params,
        ),
        pool.query<{ event_id: string; revenue: string; tickets: string }>(
          `SELECT event_id, SUM(total_cents) AS revenue, SUM(cardinality(seat_ids)) AS tickets
             FROM backoffice.orders WHERE ${confirmedInPeriod}
            GROUP BY 1`,
          params,
        ),
        // Occupancy is a stock, not a flow: seats sold to date, whatever the period.
        pool.query<{ event_id: string; section_id: string; sold: string }>(
          `SELECT event_id, section_id, COUNT(*) AS sold
             FROM backoffice.order_seats WHERE event_id = ANY($1)
            GROUP BY 1, 2`,
          [eventIds],
        ),
        pool.query<{ weekday: number; hour: number; orders: string }>(
          `SELECT EXTRACT(DOW FROM settled_at AT TIME ZONE $3)::int AS weekday,
                  EXTRACT(HOUR FROM settled_at AT TIME ZONE $3)::int AS hour,
                  COUNT(*) AS orders
             FROM backoffice.orders WHERE ${confirmedInPeriod}
            GROUP BY 1, 2`,
          params,
        ),
        pool.query<{
          order_id: string;
          event_id: string;
          seat_ids: string[];
          total_cents: number;
          customer_name: string | null;
          customer_email_masked: string | null;
          settled_at: Date;
        }>(
          `SELECT order_id, event_id, seat_ids, total_cents, customer_name, customer_email_masked, settled_at
             FROM backoffice.orders WHERE ${confirmedInPeriod}
            ORDER BY settled_at DESC LIMIT 8`,
          params,
        ),
      ]);

      const totalsRow = totals.rows[0];
      return {
        totals: {
          revenueCents: num(totalsRow?.revenue ?? 0),
          orders: num(totalsRow?.orders ?? 0),
          tickets: num(totalsRow?.tickets ?? 0),
        },
        outcomes: Object.fromEntries(outcomes.rows.map((row) => [row.outcome, num(row.orders)])),
        byDay: byDay.rows.map((row) => ({ date: row.date, revenueCents: num(row.revenue), tickets: num(row.tickets) })),
        byEvent: byEvent.rows.map((row) => ({
          eventId: row.event_id,
          revenueCents: num(row.revenue),
          tickets: num(row.tickets),
        })),
        soldToDateBySection: bySection.rows.map((row) => ({
          eventId: row.event_id,
          sectionId: row.section_id,
          sold: num(row.sold),
        })),
        heatmap: heatmap.rows.map((row) => ({ weekday: row.weekday, hour: row.hour, orders: num(row.orders) })),
        recent: recent.rows.map((row) => ({
          orderId: row.order_id,
          eventId: row.event_id,
          seatIds: row.seat_ids,
          totalCents: row.total_cents,
          customerName: row.customer_name ?? '',
          customerEmailMasked: row.customer_email_masked ?? '',
          confirmedAt: row.settled_at,
        })),
      };
    },
  };
}

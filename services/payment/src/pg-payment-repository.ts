import { enqueueOutbox, withTransaction, type Pool } from '@plateia/platform';
import type { PaymentRepository } from './handlers';

export function createPgPaymentRepository(pool: Pool): PaymentRepository {
  return {
    async record(payment, outcome) {
      return withTransaction(pool, async (client) => {
        const inserted = await client.query(
          `INSERT INTO payment.payments (id, order_id, amount_cents, status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (order_id) DO NOTHING`,
          [payment.id, payment.orderId, payment.amountCents, payment.status],
        );
        if (inserted.rowCount !== 1) return false;
        await enqueueOutbox(client, 'payment', outcome);
        return true;
      });
    },

    async refund(orderId) {
      const updated = await pool.query(
        `UPDATE payment.payments SET status = 'refunded', updated_at = now()
          WHERE order_id = $1 AND status = 'approved'`,
        [orderId],
      );
      return updated.rowCount === 1;
    },
  };
}

import type { Pool } from '@plateia/platform';
import type { NotificationLog } from '../application/ports';

const MAX_ERROR_LENGTH = 500;

export function createPgNotificationLog(pool: Pool): NotificationLog {
  return {
    async claim(orderId, kind) {
      // Insert-or-read in one statement; the primary key settles concurrent consumers.
      const { rows } = await pool.query<{ status: string }>(
        `INSERT INTO notification.emails (order_id, kind, status, attempts)
         VALUES ($1, $2, 'pending', 1)
         ON CONFLICT (order_id, kind) DO UPDATE
           SET attempts = notification.emails.attempts + 1, updated_at = now()
         RETURNING status`,
        [orderId, kind],
      );
      return rows[0]?.status === 'sent' ? 'already_sent' : 'claimed';
    },

    async markSent(orderId, kind, messageId) {
      await pool.query(
        `UPDATE notification.emails
            SET status = 'sent', message_id = $3, last_error = NULL, updated_at = now()
          WHERE order_id = $1 AND kind = $2`,
        [orderId, kind, messageId],
      );
    },

    async markFailed(orderId, kind, error) {
      await pool.query(
        `UPDATE notification.emails
            SET status = 'failed', last_error = $3, updated_at = now()
          WHERE order_id = $1 AND kind = $2 AND status <> 'sent'`,
        [orderId, kind, error.slice(0, MAX_ERROR_LENGTH)],
      );
    },
  };
}

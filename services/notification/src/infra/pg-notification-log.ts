import { createHmac } from 'node:crypto';
import type { Pool } from '@plateia/platform';
import type { ClaimResult, NotificationLog } from '../application/ports';

const MAX_ERROR_LENGTH = 500;

/** HMAC, not a plain hash: without the secret, a leaked log cannot be matched against known addresses. */
export function createRecipientHasher(secret: string): (email: string) => string {
  return (email) => createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
}

const toClaimResult = (status: string | undefined): ClaimResult =>
  status === 'sent' ? 'already_sent' : status === 'suppressed' ? 'already_suppressed' : 'claimed';

export function createPgNotificationLog(pool: Pool): NotificationLog {
  return {
    async claim(orderId, kind, recipientHash) {
      // Insert-or-read in one statement; the primary key settles concurrent consumers.
      const { rows } = await pool.query<{ status: string }>(
        `INSERT INTO notification.emails (order_id, kind, status, attempts, recipient_hash)
         VALUES ($1, $2, 'pending', 1, $3)
         ON CONFLICT (order_id, kind) DO UPDATE
           SET attempts = notification.emails.attempts + 1, updated_at = now()
         RETURNING status`,
        [orderId, kind, recipientHash],
      );
      return toClaimResult(rows[0]?.status);
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

    async markSuppressed(orderId, kind, reason) {
      await pool.query(
        `UPDATE notification.emails
            SET status = 'suppressed', last_error = $3, updated_at = now()
          WHERE order_id = $1 AND kind = $2 AND status <> 'sent'`,
        [orderId, kind, reason],
      );
    },

    async countSentSince(since, recipientHash) {
      const filter = recipientHash ? 'AND recipient_hash = $2' : '';
      const { rows } = await pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM notification.emails
          WHERE status = 'sent' AND updated_at >= $1 ${filter}`,
        recipientHash ? [since, recipientHash] : [since],
      );
      return Number(rows[0]?.total ?? 0);
    },
  };
}

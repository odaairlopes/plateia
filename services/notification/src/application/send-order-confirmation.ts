import type { EventOf } from '@plateia/contracts';
import { composeOrderConfirmation } from '../email/compose';
import type { CatalogReader, Mailer, NotificationLog, SendLimits, SendOutcome, SuppressionReason } from './ports';

export interface SendOrderConfirmationDeps {
  catalog: CatalogReader;
  mailer: Mailer;
  log: NotificationLog;
  /** Public URL of the web app, used for links inside the email. */
  appUrl: string;
  /** Without limits every confirmation is sent (unit tests, local tooling). */
  limits?: SendLimits;
  /** Keyed hash of a normalized address: lets the log count per recipient without storing it. */
  hashRecipient: (email: string) => string;
  clock?: () => Date;
  onOutcome?: (outcome: SendOutcome) => void;
}

const KIND = 'order_confirmed';

/**
 * Emails the tickets once an order is confirmed.
 *
 * The bus delivers at least once, so the log is checked first and a
 * redelivered event is a no-op. The remaining gap is a crash between the SMTP
 * server accepting the message and the log recording it: that would send a
 * duplicate on retry. A duplicate confirmation is preferred over a lost one.
 *
 * Anti-abuse: anyone can type any address at checkout, so with a real SMTP
 * provider the shop could be used to mail strangers. Per-recipient and daily
 * caps bound that; a capped email is recorded as suppressed, never retried,
 * and the order itself is unaffected.
 */
const DAY_MS = 24 * 60 * 60_000;

export function makeSendOrderConfirmation(deps: SendOrderConfirmationDeps) {
  async function overLimit(recipientHash: string): Promise<SuppressionReason | null> {
    if (!deps.limits) return null;
    const since = new Date((deps.clock?.() ?? new Date()).getTime() - DAY_MS);
    const [toRecipient, total] = await Promise.all([
      deps.log.countSentSince(since, recipientHash),
      deps.log.countSentSince(since),
    ]);
    if (toRecipient >= deps.limits.perRecipientPerDay) return 'recipient_limit';
    if (total >= deps.limits.perDay) return 'daily_limit';
    return null;
  }

  return async function sendOrderConfirmation(event: EventOf<'order.confirmed'>): Promise<SendOutcome> {
    const { orderId, eventId } = event.payload;

    const recipientHash = deps.hashRecipient(event.payload.customer.email);
    if ((await deps.log.claim(orderId, KIND, recipientHash)) !== 'claimed') {
      deps.onOutcome?.('skipped_duplicate');
      return 'skipped_duplicate';
    }

    const suppression = await overLimit(recipientHash);
    if (suppression) {
      await deps.log.markSuppressed(orderId, KIND, suppression);
      deps.onOutcome?.('suppressed');
      return 'suppressed';
    }

    const show = await deps.catalog.getEvent(eventId);
    // Thrown, not swallowed: the bus retries and eventually dead-letters it.
    if (!show) throw new Error(`Event ${eventId} of order ${orderId} not found in the catalog`);

    try {
      const email = await composeOrderConfirmation({ payload: event.payload, event: show, appUrl: deps.appUrl });
      const { messageId } = await deps.mailer.send(email);
      await deps.log.markSent(orderId, KIND, messageId);
      deps.onOutcome?.('sent');
      return 'sent';
    } catch (error) {
      await deps.log.markFailed(orderId, KIND, error instanceof Error ? error.message : String(error));
      deps.onOutcome?.('failed');
      throw error;
    }
  };
}

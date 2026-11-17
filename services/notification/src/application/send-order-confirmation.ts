import type { EventOf } from '@plateia/contracts';
import { composeOrderConfirmation } from '../email/compose';
import type { CatalogReader, Mailer, NotificationLog, SendOutcome } from './ports';

export interface SendOrderConfirmationDeps {
  catalog: CatalogReader;
  mailer: Mailer;
  log: NotificationLog;
  /** Public URL of the web app, used for links inside the email. */
  appUrl: string;
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
 */
export function makeSendOrderConfirmation(deps: SendOrderConfirmationDeps) {
  return async function sendOrderConfirmation(event: EventOf<'order.confirmed'>): Promise<SendOutcome> {
    const { orderId, eventId } = event.payload;

    if ((await deps.log.claim(orderId, KIND)) === 'already_sent') {
      deps.onOutcome?.('skipped_duplicate');
      return 'skipped_duplicate';
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

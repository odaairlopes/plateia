import { createEvent, type DomainEvent } from '@plateia/contracts';
import type { EventHandlers } from '@plateia/platform';

export type PaymentStatus = 'approved' | 'declined' | 'refunded';

export interface Payment {
  id: string;
  orderId: string;
  amountCents: number;
  status: PaymentStatus;
}

export interface PaymentRepository {
  /**
   * Stores the payment and its outcome event atomically.
   * Returns false (and stores nothing) when the order already has a payment.
   */
  record(payment: Payment, outcome: DomainEvent): Promise<boolean>;
  /** Marks an approved payment as refunded. Returns false when there was nothing to refund. */
  refund(orderId: string): Promise<boolean>;
}

export interface PaymentHandlerDeps {
  payments: PaymentRepository;
  newId: () => string;
  /** Stands in for the latency of a real payment provider. */
  simulateProvider: () => Promise<void>;
}

/**
 * The payment provider is simulated: no card data exists anywhere in the
 * system and the outcome comes from the order's `paymentScenario`.
 * What is real is the messaging behaviour around it — idempotent consumption
 * and an outcome event written through the outbox.
 */
export function makePaymentHandlers(deps: PaymentHandlerDeps): EventHandlers {
  return {
    'order.created': async (event) => {
      await deps.simulateProvider();

      const { orderId, totalCents, paymentScenario } = event.payload;
      const paymentId = deps.newId();
      const approved = paymentScenario === 'approve';

      await deps.payments.record(
        { id: paymentId, orderId, amountCents: totalCents, status: approved ? 'approved' : 'declined' },
        approved
          ? createEvent('payment.succeeded', { orderId, paymentId })
          : createEvent('payment.failed', { orderId, paymentId, reason: 'declined_by_provider' }),
      );
    },

    // Compensating action of the saga: the order did not go through after all.
    'order.cancelled': async (event) => {
      await deps.payments.refund(event.payload.orderId);
    },
  };
}

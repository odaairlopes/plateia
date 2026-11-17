import { createEvent, type CancelReason } from '@plateia/contracts';
import { cancelOrder, confirmOrder, type Order } from '../domain/order';
import type { Clock, HoldStore, OrderRepository, SeatNotifier } from './ports';

export interface SettleOrderDeps {
  orders: OrderRepository;
  holds: HoldStore;
  notifier: SeatNotifier;
}

/**
 * Second half of the checkout saga: reacts to the payment outcome.
 * Events arrive at-least-once and possibly late, so every handler first
 * checks the current state and does nothing when the work is already done.
 */
export function makeSettleOrder(deps: SettleOrderDeps) {
  async function afterSettle(order: Order | null): Promise<void> {
    if (!order) return;
    await deps.holds.release(order.holdId);
    await deps.notifier.seatsChanged(order.eventId);
  }

  async function cancelIfPending(orderId: string, reason: CancelReason): Promise<Order | null> {
    return deps.orders.transaction(async (tx) => {
      const order = await tx.findForUpdate(orderId);
      if (!order || order.status !== 'pending_payment') return null;
      const cancelled = cancelOrder(order, reason);
      await tx.save(cancelled);
      await tx.enqueue(createEvent('order.cancelled', { orderId, reason }));
      return cancelled;
    });
  }

  return {
    async onPaymentSucceeded(orderId: string): Promise<void> {
      const settled = await deps.orders.transaction(async (tx) => {
        const order = await tx.findForUpdate(orderId);
        if (!order || order.status === 'confirmed') return null;

        if (order.status === 'cancelled') {
          // The money arrived after the order was cancelled (e.g. it expired).
          // Re-announce the cancellation so the payment service refunds it.
          await tx.enqueue(
            createEvent('order.cancelled', { orderId, reason: order.cancelReason ?? 'expired' }),
          );
          return null;
        }

        if (await tx.claimSeats(order)) {
          const confirmed = confirmOrder(order);
          await tx.save(confirmed);
          await tx.enqueue(
            createEvent('order.confirmed', {
              orderId,
              eventId: order.eventId,
              seatIds: order.seatIds,
              totalCents: order.totalCents,
              customer: { name: order.customerName, email: order.customerEmail },
              locale: order.locale,
            }),
          );
          return confirmed;
        }

        // Compensation: the hold lapsed and someone else bought a seat first.
        const cancelled = cancelOrder(order, 'seat_conflict');
        await tx.save(cancelled);
        await tx.enqueue(createEvent('order.cancelled', { orderId, reason: 'seat_conflict' }));
        return cancelled;
      });
      await afterSettle(settled);
    },

    async onPaymentFailed(orderId: string): Promise<void> {
      await afterSettle(await cancelIfPending(orderId, 'payment_declined'));
    },

    /** Cancels orders whose payment never came back, freeing their seats. */
    async expireStaleOrders(clock: Clock, maxAgeMs: number): Promise<number> {
      const staleIds = await deps.orders.findStalePendingIds(new Date(clock.now().getTime() - maxAgeMs));
      let expired = 0;
      for (const orderId of staleIds) {
        const cancelled = await cancelIfPending(orderId, 'expired');
        if (cancelled) expired++;
        await afterSettle(cancelled);
      }
      return expired;
    },
  };
}

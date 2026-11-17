import { createEvent, type CreateOrderRequest } from '@plateia/contracts';
import { gone } from '@plateia/platform';
import type { Order } from '../domain/order';
import type { Clock, HoldStore, OrderRepository } from './ports';

export interface CreateOrderDeps {
  holds: HoldStore;
  orders: OrderRepository;
  clock: Clock;
  newId: () => string;
  /** How long the seats stay reserved while the payment is processed. */
  paymentWindowMs: number;
}

export type CreateOrderInput = CreateOrderRequest & { sessionId: string };

/**
 * Starts the checkout saga: stores a pending order and, in the same
 * transaction, the `order.created` event that the payment service reacts to.
 * Safe to retry: the hold id is the idempotency key.
 */
export function makeCreateOrder(deps: CreateOrderDeps) {
  return async function createOrder(input: CreateOrderInput): Promise<Order> {
    const existing = await deps.orders.findByHoldId(input.holdId);
    if (existing) {
      if (existing.sessionId === input.sessionId) return existing;
      throw gone('HOLD_EXPIRED', 'The reservation has expired');
    }

    const hold = await deps.holds.find(input.holdId);
    if (!hold || hold.sessionId !== input.sessionId) {
      throw gone('HOLD_EXPIRED', 'The reservation has expired');
    }

    const extended = await deps.holds.extend(hold, deps.paymentWindowMs);
    if (!extended) throw gone('HOLD_EXPIRED', 'The reservation has expired');

    const order: Order = {
      id: deps.newId(),
      holdId: hold.holdId,
      sessionId: hold.sessionId,
      eventId: hold.eventId,
      seatIds: hold.seatIds,
      totalCents: hold.totalCents,
      customerName: input.customer.name,
      customerEmail: input.customer.email,
      status: 'pending_payment',
      cancelReason: null,
      createdAt: deps.clock.now(),
    };

    return deps.orders.createPending(
      order,
      createEvent('order.created', {
        orderId: order.id,
        eventId: order.eventId,
        seatIds: order.seatIds,
        totalCents: order.totalCents,
        paymentScenario: input.paymentScenario,
      }),
    );
  };
}

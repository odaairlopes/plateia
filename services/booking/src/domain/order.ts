import type { CancelReason, OrderDto, OrderStatus } from '@plateia/contracts';

export interface Order {
  id: string;
  holdId: string;
  sessionId: string;
  eventId: string;
  seatIds: string[];
  totalCents: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  cancelReason: CancelReason | null;
  createdAt: Date;
}

export class InvalidOrderTransition extends Error {
  constructor(orderId: string, from: OrderStatus, to: OrderStatus) {
    super(`Order ${orderId} cannot go from ${from} to ${to}`);
    this.name = 'InvalidOrderTransition';
  }
}

/**
 * Order lifecycle: pending_payment -> confirmed | cancelled. Both end states
 * are final, so every transition starts from pending_payment.
 */
function assertPending(order: Order, target: OrderStatus): void {
  if (order.status !== 'pending_payment') throw new InvalidOrderTransition(order.id, order.status, target);
}

export function confirmOrder(order: Order): Order {
  assertPending(order, 'confirmed');
  return { ...order, status: 'confirmed' };
}

export function cancelOrder(order: Order, reason: CancelReason): Order {
  assertPending(order, 'cancelled');
  return { ...order, status: 'cancelled', cancelReason: reason };
}

/** Public view: the e-mail and the session id never leave the service. */
export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    eventId: order.eventId,
    seatIds: order.seatIds,
    totalCents: order.totalCents,
    status: order.status,
    cancelReason: order.cancelReason,
    customerName: order.customerName,
    createdAt: order.createdAt.toISOString(),
  };
}

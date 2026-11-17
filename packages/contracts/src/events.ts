import { z } from 'zod';
import { cancelReasonSchema, paymentScenarioSchema } from './api';

/**
 * Domain events exchanged between services over the event bus.
 * Every consumer validates the envelope with these schemas, so a producer
 * cannot silently break a consumer: the contract lives in one place.
 */

const envelope = {
  /** Unique per event; consumers use it (or the aggregate id) for idempotency. */
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
};

export const orderCreatedSchema = z.object({
  ...envelope,
  type: z.literal('order.created'),
  payload: z.object({
    orderId: z.uuid(),
    eventId: z.string(),
    seatIds: z.array(z.string()),
    totalCents: z.number().int().nonnegative(),
    paymentScenario: paymentScenarioSchema,
  }),
});

export const paymentSucceededSchema = z.object({
  ...envelope,
  type: z.literal('payment.succeeded'),
  payload: z.object({ orderId: z.uuid(), paymentId: z.uuid() }),
});

export const paymentFailedSchema = z.object({
  ...envelope,
  type: z.literal('payment.failed'),
  payload: z.object({ orderId: z.uuid(), paymentId: z.uuid(), reason: z.string() }),
});

export const orderConfirmedSchema = z.object({
  ...envelope,
  type: z.literal('order.confirmed'),
  payload: z.object({ orderId: z.uuid(), eventId: z.string(), seatIds: z.array(z.string()) }),
});

export const orderCancelledSchema = z.object({
  ...envelope,
  type: z.literal('order.cancelled'),
  payload: z.object({ orderId: z.uuid(), reason: cancelReasonSchema }),
});

export const domainEventSchema = z.discriminatedUnion('type', [
  orderCreatedSchema,
  paymentSucceededSchema,
  paymentFailedSchema,
  orderConfirmedSchema,
  orderCancelledSchema,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent['type'];
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

export function createEvent<T extends DomainEventType>(
  type: T,
  payload: EventOf<T>['payload'],
): EventOf<T> {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type,
    payload,
  } as EventOf<T>;
}

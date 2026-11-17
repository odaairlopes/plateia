import { metrics } from '@opentelemetry/api';
import { DomainError } from '@plateia/platform';

/**
 * Business metrics of the booking service.
 *
 * They are applied as decorators around the use cases at the composition
 * root, so the application layer stays free of telemetry code and its tests
 * do not change.
 */

const meter = metrics.getMeter('plateia.booking');

const holdAttempts = meter.createCounter('plateia.holds', {
  description: 'Attempts to hold seats, by outcome (held, seats_unavailable, invalid_seat, ...)',
});
const heldSeats = meter.createCounter('plateia.seats.held', {
  description: 'Seats successfully placed on hold',
});
const ordersCreated = meter.createCounter('plateia.orders.created', {
  description: 'Checkouts started (orders created as pending payment)',
});
const streamConnections = meter.createUpDownCounter('plateia.seat_stream.connections', {
  description: 'Browsers currently connected to the seat availability stream (SSE)',
});

const outcomeOf = (error: unknown) => (error instanceof DomainError ? error.code.toLowerCase() : 'error');

export function countHolds<Input, Result extends { seatIds: string[] }>(
  holdSeats: (input: Input) => Promise<Result>,
): (input: Input) => Promise<Result> {
  return async (input) => {
    try {
      const hold = await holdSeats(input);
      holdAttempts.add(1, { outcome: 'held' });
      heldSeats.add(hold.seatIds.length);
      return hold;
    } catch (error) {
      holdAttempts.add(1, { outcome: outcomeOf(error) });
      throw error;
    }
  };
}

export function countOrders<Input, Result>(
  createOrder: (input: Input) => Promise<Result>,
): (input: Input) => Promise<Result> {
  return async (input) => {
    const order = await createOrder(input);
    ordersCreated.add(1);
    return order;
  };
}

export const seatStreamGauge = {
  opened: () => streamConnections.add(1),
  closed: () => streamConnections.add(-1),
};

import { isSeatInLayout, parseSeatId, type EventDetail, type Hold } from '@plateia/contracts';
import { conflict, notFound, unprocessable } from '@plateia/platform';
import type { CatalogGateway, Clock, HoldStore, OrderRepository, SeatNotifier } from './ports';

export interface HoldSeatsDeps {
  catalog: CatalogGateway;
  holds: HoldStore;
  orders: OrderRepository;
  notifier: SeatNotifier;
  clock: Clock;
  newId: () => string;
  holdTtlMs: number;
}

export interface HoldSeatsInput {
  sessionId: string;
  eventId: string;
  seatIds: string[];
}

function priceSeats(event: EventDetail, seatIds: string[]): number {
  let totalCents = 0;
  for (const seatId of seatIds) {
    const seat = parseSeatId(seatId);
    const section = seat ? event.sections.find((candidate) => candidate.id === seat.sectionId) : undefined;
    if (!seat || !section || !isSeatInLayout(seat, section)) {
      throw unprocessable('INVALID_SEAT', 'Seat does not exist for this event', { seatId });
    }
    totalCents += section.priceCents;
  }
  return totalCents;
}

/**
 * Temporarily reserves seats for a visitor while they check out.
 * The price is always computed on the server from the catalog.
 */
export function makeHoldSeats(deps: HoldSeatsDeps) {
  return async function holdSeats(input: HoldSeatsInput): Promise<Hold> {
    const seatIds = [...new Set(input.seatIds)];

    const event = await deps.catalog.getEvent(input.eventId);
    if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found');
    if (new Date(event.startsAt) <= deps.clock.now()) {
      throw unprocessable('EVENT_ALREADY_STARTED', 'Sales for this event are closed');
    }
    const totalCents = priceSeats(event, seatIds);

    // A visitor keeps a single hold per event: choosing again replaces the previous one.
    const previous = await deps.holds.findBySession(input.sessionId, input.eventId);
    if (previous) await deps.holds.release(previous.holdId);

    const holdId = deps.newId();
    const acquired = await deps.holds.acquire(
      { holdId, eventId: input.eventId, sessionId: input.sessionId, seatIds, totalCents },
      deps.holdTtlMs,
    );
    if (!acquired.ok) {
      if (previous) await deps.notifier.seatsChanged(input.eventId);
      throw conflict('SEATS_UNAVAILABLE', 'Some seats are no longer available', { seatIds: acquired.conflicts });
    }

    // Checked *after* acquiring: a confirmed order commits its tickets before it
    // releases its hold, so a seat can never look free in both places at once.
    const sold = await deps.orders.findSoldSeats(input.eventId, seatIds);
    if (sold.length > 0) {
      await deps.holds.release(holdId);
      throw conflict('SEATS_UNAVAILABLE', 'Some seats are no longer available', { seatIds: sold });
    }

    await deps.notifier.seatsChanged(input.eventId);
    return {
      holdId,
      eventId: input.eventId,
      seatIds,
      totalCents,
      expiresAt: acquired.expiresAt.toISOString(),
    };
  };
}

export function makeReleaseHold(deps: Pick<HoldSeatsDeps, 'holds' | 'notifier'>) {
  return async function releaseHold(input: { sessionId: string; holdId: string }): Promise<void> {
    const hold = await deps.holds.find(input.holdId);
    // Unknown, expired or someone else's hold: nothing to do, and nothing to reveal.
    if (!hold || hold.sessionId !== input.sessionId) return;
    await deps.holds.release(hold.holdId);
    await deps.notifier.seatsChanged(hold.eventId);
  };
}

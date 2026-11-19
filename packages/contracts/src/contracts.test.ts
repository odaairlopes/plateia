import { describe, expect, it } from 'vitest';
import { createEvent, domainEventSchema, formatSeatId, isSeatInLayout, parseSeatId, rowLabel } from './index';

describe('seat ids', () => {
  it('round-trips a seat reference', () => {
    const seat = { sectionId: 'plateia-a', row: 3, number: 12 };
    expect(parseSeatId(formatSeatId(seat))).toEqual(seat);
  });

  it.each(['', 'vip', 'vip:1', 'VIP:1:1', 'vip:a:1', 'vip:1:1:1', 'vip:1:-2'])('rejects malformed id %j', (seatId) => {
    expect(parseSeatId(seatId)).toBeNull();
  });

  it('checks seats against the section layout', () => {
    const section = { id: 'vip', rows: 4, seatsPerRow: 10 };
    expect(isSeatInLayout({ sectionId: 'vip', row: 4, number: 10 }, section)).toBe(true);
    expect(isSeatInLayout({ sectionId: 'vip', row: 5, number: 1 }, section)).toBe(false);
    expect(isSeatInLayout({ sectionId: 'vip', row: 1, number: 0 }, section)).toBe(false);
    expect(isSeatInLayout({ sectionId: 'pista', row: 1, number: 1 }, section)).toBe(false);
  });

  it('labels rows with letters', () => {
    expect(rowLabel(1)).toBe('A');
    expect(rowLabel(26)).toBe('Z');
  });
});

describe('domain events', () => {
  it('creates events that satisfy the shared schema', () => {
    const event = createEvent('order.cancelled', {
      orderId: crypto.randomUUID(),
      reason: 'expired',
    });
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('rejects events with an unknown type', () => {
    const result = domainEventSchema.safeParse({
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: 'order.teleported',
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});

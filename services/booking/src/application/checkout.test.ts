import { beforeEach, describe, expect, it } from 'vitest';
import { makeCreateOrder } from './create-order';
import { makeHoldSeats, makeReleaseHold } from './hold-seats';
import { makeSettleOrder } from './settle-order';
import {
  FakeCatalog,
  FakeClock,
  InMemoryHoldStore,
  InMemoryOrderRepository,
  RecordingNotifier,
  sampleEvent,
  sequentialIds,
} from './testing/fakes';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const HOLD_TTL = 5 * 60_000;
const PAYMENT_WINDOW = 2 * 60_000;
const customer = { name: 'Alice Souza', email: 'alice@example.com' };

function setup() {
  const clock = new FakeClock();
  const holds = new InMemoryHoldStore(clock);
  const orders = new InMemoryOrderRepository();
  const notifier = new RecordingNotifier();
  const newId = sequentialIds();
  const holdSeats = makeHoldSeats({
    catalog: new FakeCatalog([sampleEvent]),
    holds,
    orders,
    notifier,
    clock,
    newId,
    holdTtlMs: HOLD_TTL,
  });
  const releaseHold = makeReleaseHold({ holds, notifier });
  const createOrder = makeCreateOrder({ holds, orders, clock, newId, paymentWindowMs: PAYMENT_WINDOW });
  const settle = makeSettleOrder({ orders, holds, notifier });
  return { clock, holds, orders, notifier, holdSeats, releaseHold, createOrder, settle };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('holding seats', () => {
  it('prices the hold on the server from the catalog', async () => {
    const hold = await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1', 'pista:2:3'] });
    expect(hold.totalCents).toBe(25000);
    expect(await ctx.holds.listHeldSeats('show')).toEqual(['vip:1:1', 'pista:2:3']);
    expect(ctx.notifier.notified).toEqual(['show']);
  });

  it('rejects seats outside the venue layout', async () => {
    await expect(ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:3:1'] })).rejects.toMatchObject({
      code: 'INVALID_SEAT',
      status: 422,
    });
  });

  it('rejects unknown events', async () => {
    await expect(ctx.holdSeats({ sessionId: ALICE, eventId: 'missing', seatIds: ['vip:1:1'] })).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
      status: 404,
    });
  });

  it('closes sales once the event has started', async () => {
    ctx.clock.advance(365 * 24 * 60 * 60_000);
    await expect(ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1'] })).rejects.toMatchObject({
      code: 'EVENT_ALREADY_STARTED',
    });
  });

  it('does not let two visitors hold the same seat', async () => {
    await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1', 'vip:1:2'] });
    await expect(
      ctx.holdSeats({ sessionId: BRUNO, eventId: 'show', seatIds: ['vip:1:2', 'vip:1:3'] }),
    ).rejects.toMatchObject({ code: 'SEATS_UNAVAILABLE', status: 409, details: { seatIds: ['vip:1:2'] } });
    // All or nothing: the free seat of the failed request was not taken.
    expect(await ctx.holds.listHeldSeats('show')).toEqual(['vip:1:1', 'vip:1:2']);
  });

  it('replaces the previous hold of the same visitor', async () => {
    await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1'] });
    await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:2'] });
    expect(await ctx.holds.listHeldSeats('show')).toEqual(['vip:1:2']);
  });

  it('frees the seats when the hold expires', async () => {
    await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1'] });
    ctx.clock.advance(HOLD_TTL + 1);
    await expect(ctx.holdSeats({ sessionId: BRUNO, eventId: 'show', seatIds: ['vip:1:1'] })).resolves.toMatchObject({
      seatIds: ['vip:1:1'],
    });
  });

  it('only lets the owner release a hold', async () => {
    const hold = await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1'] });
    await ctx.releaseHold({ sessionId: BRUNO, holdId: hold.holdId });
    expect(await ctx.holds.listHeldSeats('show')).toEqual(['vip:1:1']);
    await ctx.releaseHold({ sessionId: ALICE, holdId: hold.holdId });
    expect(await ctx.holds.listHeldSeats('show')).toEqual([]);
  });
});

describe('checkout saga', () => {
  async function pendingOrder(sessionId = ALICE, seatIds = ['vip:1:1']) {
    const hold = await ctx.holdSeats({ sessionId, eventId: 'show', seatIds });
    return ctx.createOrder({ sessionId, holdId: hold.holdId, customer, paymentScenario: 'approve', locale: 'pt' });
  }

  it('creates a pending order and announces it', async () => {
    const order = await pendingOrder();
    expect(order).toMatchObject({ status: 'pending_payment', totalCents: 20000, seatIds: ['vip:1:1'] });
    expect(ctx.orders.publishedTypes()).toEqual(['order.created']);
  });

  it('is idempotent: retrying the same hold returns the same order', async () => {
    const hold = await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1'] });
    const input = {
      sessionId: ALICE,
      holdId: hold.holdId,
      customer,
      paymentScenario: 'approve' as const,
      locale: 'pt' as const,
    };
    const first = await ctx.createOrder(input);
    const second = await ctx.createOrder(input);
    expect(second.id).toBe(first.id);
    expect(ctx.orders.publishedTypes()).toEqual(['order.created']);
  });

  it("refuses to check out someone else's or an expired hold", async () => {
    const hold = await ctx.holdSeats({ sessionId: ALICE, eventId: 'show', seatIds: ['vip:1:1'] });
    const input = { holdId: hold.holdId, customer, paymentScenario: 'approve' as const, locale: 'pt' as const };
    await expect(ctx.createOrder({ ...input, sessionId: BRUNO })).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    ctx.clock.advance(HOLD_TTL + 1);
    await expect(ctx.createOrder({ ...input, sessionId: ALICE })).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
  });

  it('confirms the order and sells the seats when the payment succeeds', async () => {
    const order = await pendingOrder();
    await ctx.settle.onPaymentSucceeded(order.id);

    expect((await ctx.orders.findById(order.id))?.status).toBe('confirmed');
    expect(await ctx.orders.findSoldSeats('show')).toEqual(['vip:1:1']);
    expect(await ctx.holds.listHeldSeats('show')).toEqual([]);
    expect(ctx.orders.publishedTypes()).toEqual(['order.created', 'order.confirmed']);
    // Notifications need everything to write the email without calling back.
    expect(ctx.orders.published.at(-1)).toMatchObject({
      type: 'order.confirmed',
      payload: { totalCents: 20000, customer, locale: 'pt', seatIds: ['vip:1:1'] },
    });
    await expect(ctx.holdSeats({ sessionId: BRUNO, eventId: 'show', seatIds: ['vip:1:1'] })).rejects.toMatchObject({
      code: 'SEATS_UNAVAILABLE',
    });
  });

  it('ignores a duplicated payment event', async () => {
    const order = await pendingOrder();
    await ctx.settle.onPaymentSucceeded(order.id);
    await ctx.settle.onPaymentSucceeded(order.id);
    expect(ctx.orders.publishedTypes()).toEqual(['order.created', 'order.confirmed']);
  });

  it('cancels the order and frees the seats when the payment fails', async () => {
    const order = await pendingOrder();
    await ctx.settle.onPaymentFailed(order.id);

    expect(await ctx.orders.findById(order.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'payment_declined',
    });
    expect(await ctx.holds.listHeldSeats('show')).toEqual([]);
    expect(await ctx.orders.findSoldSeats('show')).toEqual([]);
    expect(ctx.orders.publishedTypes()).toEqual(['order.created', 'order.cancelled']);
  });

  it('compensates when the seat was sold to someone else in the meantime', async () => {
    const slow = await pendingOrder(ALICE);
    ctx.clock.advance(PAYMENT_WINDOW + 1); // Alice's hold lapses while her payment is in flight
    const fast = await pendingOrder(BRUNO);
    await ctx.settle.onPaymentSucceeded(fast.id);
    await ctx.settle.onPaymentSucceeded(slow.id);

    expect((await ctx.orders.findById(fast.id))?.status).toBe('confirmed');
    expect(await ctx.orders.findById(slow.id)).toMatchObject({ status: 'cancelled', cancelReason: 'seat_conflict' });
    expect(ctx.orders.published.at(-1)).toMatchObject({
      type: 'order.cancelled',
      payload: { orderId: slow.id, reason: 'seat_conflict' },
    });
  });

  it('expires orders whose payment never came back', async () => {
    const order = await pendingOrder();
    ctx.clock.advance(10 * 60_000);
    expect(await ctx.settle.expireStaleOrders(ctx.clock, 5 * 60_000)).toBe(1);
    expect(await ctx.orders.findById(order.id)).toMatchObject({ status: 'cancelled', cancelReason: 'expired' });
  });

  it('asks for a refund when the payment arrives after the order expired', async () => {
    const order = await pendingOrder();
    ctx.clock.advance(10 * 60_000);
    await ctx.settle.expireStaleOrders(ctx.clock, 5 * 60_000);
    await ctx.settle.onPaymentSucceeded(order.id);

    expect((await ctx.orders.findById(order.id))?.status).toBe('cancelled');
    expect(ctx.orders.publishedTypes()).toEqual(['order.created', 'order.cancelled', 'order.cancelled']);
  });
});

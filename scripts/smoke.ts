/**
 * End-to-end smoke test of the purchase flow against running services.
 *
 * It exercises what unit tests cannot: real Postgres and Redis, the Lua hold
 * scripts, the outbox relay, Redis Streams and the saga across two services.
 * Seats are picked from what is currently free, so it can run repeatedly
 * against a local environment as well as against a fresh database in CI.
 *
 *   npm run smoke
 */
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import type { EventDetail, EventSummary, Hold, OrderDto, SeatMap } from '@plateia/contracts';

const CATALOG_URL = process.env.CATALOG_URL ?? 'http://localhost:3001';
const BOOKING_URL = process.env.BOOKING_URL ?? 'http://localhost:3002';
const SAGA_TIMEOUT_MS = 20_000;

interface ApiResult<T> {
  status: number;
  body: T;
}

async function call<T>(url: string, init: RequestInit & { session?: string } = {}): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  if (init.session) headers.set('x-session-id', init.session);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

const post = <T>(url: string, session: string, body: unknown) =>
  call<T>(url, { method: 'POST', session, body: JSON.stringify(body) });

async function step(name: string, run: () => Promise<void>): Promise<void> {
  const startedAt = performance.now();
  await run();
  console.log(`  ✓ ${name} (${Math.round(performance.now() - startedAt)} ms)`);
}

async function freeSeats(event: EventDetail, count: number): Promise<string[]> {
  const { body: map } = await call<SeatMap>(`${BOOKING_URL}/events/${event.id}/seats`);
  const taken = new Set([...map.sold, ...map.held]);
  const free: string[] = [];
  for (const section of event.sections) {
    for (let row = 1; row <= section.rows; row++) {
      for (let number = 1; number <= section.seatsPerRow; number++) {
        const seatId = `${section.id}:${row}:${number}`;
        if (!taken.has(seatId)) free.push(seatId);
        if (free.length === count) return free;
      }
    }
  }
  throw new Error(`Event ${event.id} has fewer than ${count} free seats`);
}

/** The outcome arrives asynchronously through the saga: poll until it settles. */
async function settledOrder(orderId: string, session: string): Promise<OrderDto> {
  const deadline = Date.now() + SAGA_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { body } = await call<OrderDto>(`${BOOKING_URL}/orders/${orderId}`, { session });
    if (body.status !== 'pending_payment') return body;
    await sleep(250);
  }
  throw new Error(`Order ${orderId} still pending after ${SAGA_TIMEOUT_MS} ms`);
}

async function main(): Promise<void> {
  const alice = crypto.randomUUID();
  const bruno = crypto.randomUUID();
  const customer = { name: 'Smoke Test', email: 'smoke@example.com' };
  let event!: EventDetail;

  console.log(`Smoke test against catalog=${CATALOG_URL} booking=${BOOKING_URL}`);

  await step('catalog lists events with their sections', async () => {
    const list = await call<EventSummary[]>(`${CATALOG_URL}/events`);
    assert.equal(list.status, 200);
    assert.ok(list.body.length > 0, 'catalog is empty');
    const firstEvent = list.body[0];
    assert.ok(firstEvent);
    const detail = await call<EventDetail>(`${CATALOG_URL}/events/${firstEvent.id}`);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.sections.length > 0, 'event has no sections');
    event = detail.body;
  });

  const [seatA, seatB, seatC] = await freeSeats(event, 3);
  assert.ok(seatA && seatB && seatC);

  await step('a confirmed purchase sells the seats', async () => {
    const hold = await post<Hold>(`${BOOKING_URL}/holds`, alice, { eventId: event.id, seatIds: [seatA, seatB] });
    assert.equal(hold.status, 201, `hold failed: ${JSON.stringify(hold.body)}`);

    const conflict = await post(`${BOOKING_URL}/holds`, bruno, { eventId: event.id, seatIds: [seatB, seatC] });
    assert.equal(conflict.status, 409, 'a held seat was handed to a second visitor');

    const request = { holdId: hold.body.holdId, customer, paymentScenario: 'approve' };
    const order = await post<OrderDto>(`${BOOKING_URL}/orders`, alice, request);
    assert.equal(order.status, 202);
    const retry = await post<OrderDto>(`${BOOKING_URL}/orders`, alice, request);
    assert.equal(retry.body.id, order.body.id, 'retrying the checkout created a second order');

    const settled = await settledOrder(order.body.id, alice);
    assert.equal(settled.status, 'confirmed');

    const { body: map } = await call<SeatMap>(`${BOOKING_URL}/events/${event.id}/seats`);
    assert.ok(map.sold.includes(seatA) && map.sold.includes(seatB), 'confirmed seats are not marked as sold');

    const stranger = await call(`${BOOKING_URL}/orders/${order.body.id}`, { session: bruno });
    assert.equal(stranger.status, 404, "an order was visible to another visitor's session");
  });

  await step('a declined payment releases the seat', async () => {
    const hold = await post<Hold>(`${BOOKING_URL}/holds`, bruno, { eventId: event.id, seatIds: [seatC] });
    assert.equal(hold.status, 201, `hold failed: ${JSON.stringify(hold.body)}`);
    const order = await post<OrderDto>(`${BOOKING_URL}/orders`, bruno, {
      holdId: hold.body.holdId,
      customer,
      paymentScenario: 'decline',
    });
    const settled = await settledOrder(order.body.id, bruno);
    assert.equal(settled.status, 'cancelled');
    assert.equal(settled.cancelReason, 'payment_declined');

    const { body: map } = await call<SeatMap>(`${BOOKING_URL}/events/${event.id}/seats`);
    assert.ok(!map.sold.includes(seatC) && !map.held.includes(seatC), 'the seat was not released');
  });

  await step('invalid input is rejected', async () => {
    const outside = await post(`${BOOKING_URL}/holds`, alice, { eventId: event.id, seatIds: ['nowhere:99:99'] });
    assert.equal(outside.status, 422);
    const noSession = await call(`${BOOKING_URL}/holds`, {
      method: 'POST',
      body: JSON.stringify({ eventId: event.id, seatIds: [seatC] }),
    });
    assert.equal(noSession.status, 400);
  });

  console.log('Smoke test passed.');
}

main().catch((error: unknown) => {
  console.error('Smoke test FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});

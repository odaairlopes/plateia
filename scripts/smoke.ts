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
import type { Dashboard, EventDetail, EventSummary, Hold, OrderDto, SeatMap } from '@plateia/contracts';

const CATALOG_URL = process.env.CATALOG_URL ?? 'http://localhost:3001';
const BOOKING_URL = process.env.BOOKING_URL ?? 'http://localhost:3002';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const BACKOFFICE_URL = process.env.BACKOFFICE_URL ?? 'http://localhost:3005';
// Demo organizer accounts seeded by the back-office migrations (development only).
const DEMO_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'plateia-demo-2026';
const ORGANIZER_BY_EVENT: Record<string, string> = {
  'noite-de-vidro': 'ana@aurora.dev',
  'orquestra-do-vale': 'ana@aurora.dev',
  'o-ultimo-farol': 'ana@aurora.dev',
  'festival-maresia': 'bruno@marealta.dev',
  'circuito-baixo-centro': 'bruno@marealta.dev',
  'riso-solto': 'bruno@marealta.dev',
};
const PROJECTION_TIMEOUT_MS = 20_000;
const EMAIL_TIMEOUT_MS = 20_000;
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

interface MailpitSummary {
  ID: string;
  Subject: string;
}

interface MailpitMessage {
  HTML: string;
  Text: string;
  Inline: Array<{ ContentType: string }>;
}

/** Waits for the confirmation email to land in Mailpit (the local SMTP catcher). */
async function receivedEmail(address: string): Promise<MailpitSummary & MailpitMessage> {
  const deadline = Date.now() + EMAIL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    const [summary] = messages;
    if (summary) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${summary.ID}`)).json()) as MailpitMessage;
      return { ...summary, ...message };
    }
    await sleep(500);
  }
  throw new Error(`No email reached ${address} within ${EMAIL_TIMEOUT_MS} ms`);
}

/** Signs in to the back office and returns the session cookie. */
async function signIn(email: string): Promise<string> {
  const response = await fetch(`${BACKOFFICE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  assert.equal(response.status, 200, `organizer sign-in failed with ${response.status}`);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('plateia_admin='));
  assert.ok(cookie, 'no session cookie');
  assert.match(cookie, /HttpOnly/i, 'session cookie must be httpOnly');
  return cookie.split(';')[0] ?? '';
}

async function dashboard(cookie: string, eventId: string): Promise<{ status: number; body: Dashboard }> {
  const response = await fetch(`${BACKOFFICE_URL}/dashboard?period=7d&eventId=${eventId}`, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as Dashboard };
}

async function main(): Promise<void> {
  const alice = crypto.randomUUID();
  const bruno = crypto.randomUUID();
  // A unique address per run, so the email check never matches an older run.
  const customer = { name: 'Smoke Test', email: `smoke-${crypto.randomUUID().slice(0, 8)}@example.com` };
  let event!: EventDetail;
  let confirmedOrderId = '';

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
    confirmedOrderId = order.body.id;
  });

  await step("the organizer's dashboard shows the sale, and only to them", async () => {
    const owner = ORGANIZER_BY_EVENT[event.id];
    assert.ok(owner, `no demo organizer owns ${event.id}`);

    const anonymous = await fetch(`${BACKOFFICE_URL}/dashboard`);
    assert.equal(anonymous.status, 401, 'the dashboard answered without a session');

    const cookie = await signIn(owner);
    // The read model is fed by events: poll until the projection catches up.
    const code = confirmedOrderId.slice(0, 8).toUpperCase();
    const deadline = Date.now() + PROJECTION_TIMEOUT_MS;
    let seen = false;
    while (!seen && Date.now() < deadline) {
      const { status, body } = await dashboard(cookie, event.id);
      assert.equal(status, 200);
      seen = body.recentOrders.some((recent) => recent.code === code);
      if (!seen) await sleep(500);
    }
    assert.ok(seen, `order ${code} never reached the organizer dashboard`);

    const otherOrganizer = Object.values(ORGANIZER_BY_EVENT).find((email) => email !== owner) ?? '';
    const foreign = await dashboard(await signIn(otherOrganizer), event.id);
    assert.equal(foreign.status, 404, "an organizer could read another organizer's event");
  });

  await step('the customer receives the tickets by email', async () => {
    const email = await receivedEmail(customer.email);
    assert.ok(email.Subject.includes(event.title), `unexpected subject: ${email.Subject}`);
    assert.ok(email.HTML.includes(confirmedOrderId.slice(0, 8).toUpperCase()), 'order code missing from the email');
    assert.ok(email.Text.length > 0, 'plain-text alternative missing');
    assert.equal(email.Inline.filter((part) => part.ContentType === 'image/png').length, 1, 'QR code missing');
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

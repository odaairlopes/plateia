/**
 * Demo sales history for the organizer dashboard.
 *
 *   npm run seed:demo            (once; run the services at least once before)
 *   npm run seed:demo -- --force (add another batch)
 *
 * A dashboard needs weeks of history to be worth looking at, and real
 * purchases all happen "now". This script writes ~75 days of plausible sales
 * straight into the databases: orders and tickets in booking (so the seat maps
 * show those seats as sold) and the same orders in the back-office projection.
 *
 * Trade-off, stated on purpose: the seed bypasses the event bus. Replaying the
 * stream to rebuild the projection would not bring these rows back; they are
 * marked with source = 'seed'. Development data only.
 */
import { randomUUID } from 'node:crypto';
import { withTransaction, createPool, type PoolClient } from '@plateia/platform';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://plateia:plateia@localhost:5433/plateia';
const SALES_WINDOW_DAYS = 75;
const DAY_MS = 24 * 60 * 60_000;

/** Share of each venue sold when the seed finishes (existing sales included). */
const TARGET_OCCUPANCY: Record<string, number> = {
  'noite-de-vidro': 0.72,
  'festival-maresia': 0.64,
  'orquestra-do-vale': 0.55,
  'riso-solto': 0.7,
  'circuito-baixo-centro': 0.47,
  'o-ultimo-farol': 0.38,
};

const FIRST_NAMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Valéria', 'Yuri'];
const LAST_NAMES = ['Almeida', 'Barros', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Lima', 'Moreira', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Rocha', 'Santos', 'Teixeira', 'Vieira'];

// Purchases by hour of the day: lunch break and evening peaks.
const HOUR_WEIGHTS = [1, 0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2, 2.6, 3, 3.4, 4.6, 4.8, 3.6, 3.2, 3.4, 3.8, 4.6, 5.6, 6.4, 6, 4.4, 2.4];

/** Deterministic pseudo-random numbers (mulberry32): the same seed gives the same demo. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rand: () => number, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rand() * total;
  for (let index = 0; index < items.length; index++) {
    roll -= weights[index] ?? 0;
    if (roll <= 0) return items[index] as T;
  }
  return items[items.length - 1] as T;
}

const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const ascii = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Section {
  id: string;
  price_cents: number;
  rows: number;
  seats_per_row: number;
}

async function seedEvent(
  client: PoolClient,
  rand: () => number,
  eventId: string,
  sections: Section[],
  now: Date,
): Promise<{ confirmed: number; cancelled: number; seats: number }> {
  const taken = new Set(
    (await client.query<{ seat_id: string }>('SELECT seat_id FROM booking.tickets WHERE event_id = $1', [eventId])).rows.map(
      (row) => row.seat_id,
    ),
  );
  const capacity = sections.reduce((sum, section) => sum + section.rows * section.seats_per_row, 0);
  const target = Math.floor(capacity * (TARGET_OCCUPANCY[eventId] ?? 0.5));

  // Day weights: launch-day rush, slow middle, growing demand as the show approaches, busier weekends.
  const days = Array.from({ length: SALES_WINDOW_DAYS }, (_, index) => index);
  const dayWeights = days.map((day) => {
    const date = new Date(now.getTime() - (SALES_WINDOW_DAYS - day) * DAY_MS);
    const launch = day < 2 ? 7 - day * 3 : 0;
    const weekend = [0, 5, 6].includes(date.getUTCDay()) ? 1.35 : 1;
    return (0.6 + (day / SALES_WINDOW_DAYS) * 1.8 + launch) * weekend * (0.7 + rand() * 0.6);
  });

  const result = { confirmed: 0, cancelled: 0, seats: 0 };

  for (let attempt = 0; taken.size < target && attempt < 4000; attempt++) {
    const quantity = pickWeighted(rand, [1, 2, 3, 4], [25, 45, 15, 15]);
    const section = pickWeighted(rand, sections, sections.map((s) => s.rows * s.seats_per_row));

    // Neighbouring seats in one row, like real groups buy.
    let seats: string[] | null = null;
    for (let tries = 0; tries < 12 && !seats; tries++) {
      const row = 1 + Math.floor(rand() * section.rows);
      const start = 1 + Math.floor(rand() * Math.max(1, section.seats_per_row - quantity + 1));
      const candidate = Array.from({ length: quantity }, (_, offset) => `${section.id}:${row}:${start + offset}`);
      if (start + quantity - 1 <= section.seats_per_row && candidate.every((seat) => !taken.has(seat))) seats = candidate;
    }
    if (!seats) continue;

    const day = pickWeighted(rand, days, dayWeights);
    const hour = pickWeighted(rand, [...HOUR_WEIGHTS.keys()], HOUR_WEIGHTS);
    // Hours are São Paulo local time (UTC-3).
    const dayStart = new Date(now.getTime() - (SALES_WINDOW_DAYS - day) * DAY_MS);
    const settledAt = new Date(
      Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), hour + 3, Math.floor(rand() * 60), Math.floor(rand() * 60)),
    );
    if (settledAt.getTime() > now.getTime() - 10 * 60_000) continue;
    const createdAt = new Date(settledAt.getTime() - (60 + Math.floor(rand() * 240)) * 1000);

    const roll = rand();
    const status = roll < 0.86 ? 'confirmed' : 'cancelled';
    const cancelReason = roll < 0.86 ? null : roll < 0.93 ? 'payment_declined' : roll < 0.97 ? 'expired' : 'seat_conflict';

    const first = pick(rand, FIRST_NAMES);
    const last = pick(rand, LAST_NAMES);
    const name = `${first} ${last}`;
    const email = `${ascii(first)}.${ascii(last)}${Math.floor(rand() * 90 + 10)}@example.com`;
    const orderId = randomUUID();
    const totalCents = section.price_cents * seats.length;

    await client.query(
      `INSERT INTO booking.orders
         (id, hold_id, session_id, event_id, seat_ids, total_cents, customer_name, customer_email, locale, status, cancel_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [orderId, randomUUID(), randomUUID(), eventId, seats, totalCents, name, email, rand() < 0.85 ? 'pt' : 'en', status, cancelReason, createdAt, settledAt],
    );
    await client.query(
      `INSERT INTO backoffice.orders
         (order_id, event_id, status, cancel_reason, seat_ids, total_cents, customer_name, customer_email_masked, created_at, settled_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'seed')`,
      [orderId, eventId, status, cancelReason, seats, totalCents, name, `${email[0]}***@example.com`, createdAt, settledAt],
    );

    if (status === 'confirmed') {
      await client.query(
        `INSERT INTO booking.tickets (event_id, seat_id, order_id, created_at)
         SELECT $1, seat_id, $2, $3 FROM unnest($4::text[]) AS seat_id`,
        [eventId, orderId, settledAt, seats],
      );
      await client.query(
        `INSERT INTO backoffice.order_seats (order_id, event_id, seat_id, section_id)
         SELECT $1, $2, seat_id, $3 FROM unnest($4::text[]) AS seat_id`,
        [orderId, eventId, section.id, seats],
      );
      for (const seat of seats) taken.add(seat);
      result.confirmed++;
      result.seats += seats.length;
    } else {
      result.cancelled++;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const pool = createPool(DATABASE_URL);
  try {
    const schemas = await pool.query<{ ready: boolean }>(
      `SELECT to_regclass('catalog.sections') IS NOT NULL AND to_regclass('booking.tickets') IS NOT NULL
              AND to_regclass('backoffice.order_seats') IS NOT NULL AS ready`,
    );
    if (!schemas.rows[0]?.ready) {
      throw new Error('Tables not found. Start the services once (npm run dev) so they run their migrations.');
    }

    const seeded = await pool.query("SELECT 1 FROM backoffice.orders WHERE source = 'seed' LIMIT 1");
    if (seeded.rowCount && !force) {
      console.log('Demo sales already seeded. Use "npm run seed:demo -- --force" to add another batch.');
      return;
    }

    const { rows: sections } = await pool.query<Section & { event_id: string }>(
      'SELECT event_id, id, price_cents, rows, seats_per_row FROM catalog.sections ORDER BY event_id, position',
    );
    const byEvent = new Map<string, Section[]>();
    for (const section of sections) byEvent.set(section.event_id, [...(byEvent.get(section.event_id) ?? []), section]);
    const rand = random(force ? Date.now() : 2026);
    const now = new Date();

    for (const [eventId, eventSections] of byEvent) {
      const result = await withTransaction(pool, (client) => seedEvent(client, rand, eventId, eventSections, now));
      console.log(
        `${eventId.padEnd(24)} ${String(result.confirmed).padStart(4)} confirmed orders · ${String(result.seats).padStart(4)} seats · ${result.cancelled} not completed`,
      );
    }
    console.log('Done. Open http://localhost:5173/admin');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

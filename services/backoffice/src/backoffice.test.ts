import { describe, expect, it } from 'vitest';
import { createEvent, type EventDetail } from '@plateia/contracts';
import type {
  OrganizerAccount,
  OrganizerRepository,
  PasswordHasher,
  SalesAggregates,
  SalesProjection,
  SalesReadModel,
} from './application/ports';
import { makeGetDashboard, makeLogin, makeSalesProjector } from './application/use-cases';
import { buildDashboard, localDate, periodStart } from './domain/dashboard';
import { maskEmail, shortName } from './domain/privacy';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-11-17T15:00:00.000Z'); // 12:00 in São Paulo

function event(id: string, sections: Array<[string, number, number, number]>): EventDetail {
  return {
    id,
    title: `Show ${id}`,
    category: 'music',
    venue: 'Teatro',
    city: 'São Paulo, SP',
    startsAt: '2027-03-14T00:00:00.000Z',
    coverHue: 200,
    minPriceCents: 1000,
    description: { pt: '', en: '' },
    sections: sections.map(([sectionId, priceCents, rows, seatsPerRow]) => ({
      id: sectionId,
      name: { pt: sectionId, en: sectionId },
      priceCents,
      rows,
      seatsPerRow,
    })),
  };
}

const emptyAggregates: SalesAggregates = {
  totals: { revenueCents: 0, orders: 0, tickets: 0 },
  outcomes: {},
  byDay: [],
  byEvent: [],
  soldToDateBySection: [],
  heatmap: [],
  recent: [],
};

const ana: OrganizerAccount = {
  id: 'a0c4e5d2-1f3b-4c8e-9a7d-2b6f8e1c3d50',
  name: 'Aurora',
  email: 'ana@aurora.dev',
  passwordHash: 'hash:secret',
};
const bruno: OrganizerAccount = {
  id: 'b1d5f6e3-2a4c-4d9f-8b6e-3c7a9f2d4e61',
  name: 'Maré',
  email: 'bruno@marealta.dev',
  passwordHash: 'hash:other',
};

const showA = event('show-a', [
  ['vip', 20000, 2, 10],
  ['pista', 5000, 4, 20],
]); // 20 + 80 seats
const showB = event('show-b', [['plateia', 8000, 5, 10]]); // 50 seats

const organizers: OrganizerRepository = {
  async findByEmail(email) {
    return [ana, bruno].find((account) => account.email === email) ?? null;
  },
  async findById(id) {
    return [ana, bruno].find((account) => account.id === id) ?? null;
  },
  async ownedEventIds(id) {
    return id === ana.id ? ['show-a'] : ['show-b'];
  },
};

describe('dashboard numbers', () => {
  const build = (aggregates: Partial<SalesAggregates>, period: '7d' | 'all' = '7d') =>
    buildDashboard({
      organizer: { id: ana.id, name: ana.name, email: ana.email },
      ownedEvents: [showA],
      scopeEvents: [showA],
      selectedEventId: null,
      period,
      now: NOW,
      timeZone: TZ,
      aggregates: { ...emptyAggregates, ...aggregates },
    });

  it('fills days without sales with zeros, in the venue time zone', () => {
    const dashboard = build({ byDay: [{ date: '2026-11-15', revenueCents: 30000, tickets: 2 }] });
    expect(dashboard.salesByDay).toHaveLength(8); // 10th..17th inclusive
    expect(dashboard.salesByDay[0]?.date).toBe('2026-11-10');
    expect(dashboard.salesByDay.at(-1)?.date).toBe('2026-11-17');
    expect(dashboard.salesByDay.find((day) => day.date === '2026-11-15')).toEqual({
      date: '2026-11-15',
      revenueCents: 30000,
      tickets: 2,
    });
    expect(dashboard.salesByDay.find((day) => day.date === '2026-11-16')?.revenueCents).toBe(0);
  });

  it('starts "all time" at the first sale', () => {
    const dashboard = build({ byDay: [{ date: '2026-11-12', revenueCents: 1000, tickets: 1 }] }, 'all');
    expect(dashboard.salesByDay[0]?.date).toBe('2026-11-12');
    expect(dashboard.scope.from).toBeNull();
  });

  it('derives the KPIs', () => {
    const dashboard = build({
      totals: { revenueCents: 90000, orders: 3, tickets: 6 },
      outcomes: { confirmed: 3, payment_declined: 1 },
      soldToDateBySection: [
        { eventId: 'show-a', sectionId: 'vip', sold: 10 },
        { eventId: 'show-a', sectionId: 'pista', sold: 15 },
      ],
    });
    expect(dashboard.kpis).toEqual({
      revenueCents: 90000,
      ticketsSold: 6,
      ordersConfirmed: 3,
      averageTicketCents: 15000,
      conversionRate: 0.75,
      cancelledOrders: 1,
      occupancy: 0.25, // 25 of 100 seats
      capacity: 100,
    });
    expect(dashboard.bySection.map((section) => [section.sectionId, section.soldToDate, section.capacity])).toEqual([
      ['vip', 10, 20],
      ['pista', 15, 80],
    ]);
  });

  it('does not divide by zero before the first sale', () => {
    const { kpis } = build({});
    expect(kpis.averageTicketCents).toBe(0);
    expect(kpis.conversionRate).toBe(0);
    expect(kpis.occupancy).toBe(0);
  });

  it('computes period boundaries', () => {
    expect(periodStart('all', NOW)).toBeNull();
    expect(periodStart('30d', NOW)?.toISOString()).toBe('2026-10-18T15:00:00.000Z');
    // 01:30 UTC is still the previous day in São Paulo.
    expect(localDate(new Date('2026-11-17T01:30:00.000Z'), TZ)).toBe('2026-11-16');
  });
});

describe('privacy', () => {
  it('masks emails and shortens names', () => {
    expect(maskEmail('marina.costa@example.com')).toBe('m***@example.com');
    expect(maskEmail('broken')).toBe('***');
    expect(shortName('Marina Costa Silva')).toBe('Marina S.');
    expect(shortName('Cher')).toBe('Cher');
  });
});

describe('sign in', () => {
  const verified: string[] = [];
  const hasher: PasswordHasher = {
    async verify(hash, password) {
      verified.push(hash);
      return hash === `hash:${password}`;
    },
  };
  const login = makeLogin({ organizers, hasher, dummyHash: 'hash:dummy' });

  it('signs in with the right password, ignoring email case', async () => {
    await expect(login(' ANA@aurora.dev ', 'secret')).resolves.toEqual({
      id: ana.id,
      name: 'Aurora',
      email: 'ana@aurora.dev',
    });
  });

  it('answers the same for a wrong password and an unknown email', async () => {
    verified.length = 0;
    const wrongPassword = await login('ana@aurora.dev', 'nope').catch((error: unknown) => error);
    const unknownEmail = await login('nobody@aurora.dev', 'nope').catch((error: unknown) => error);
    expect(wrongPassword).toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    expect(unknownEmail).toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    // A hash is verified in both cases, so the timing does not reveal which emails exist.
    expect(verified).toEqual(['hash:secret', 'hash:dummy']);
  });
});

describe('dashboard access', () => {
  const queried: string[][] = [];
  const sales: SalesReadModel = {
    async aggregate({ eventIds }) {
      queried.push(eventIds);
      return emptyAggregates;
    },
  };
  const getDashboard = makeGetDashboard({
    organizers,
    catalog: { getEvent: async (id) => [showA, showB].find((show) => show.id === id) ?? null },
    sales,
    clock: () => NOW,
  });

  it("only reports on the organizer's own events", async () => {
    queried.length = 0;
    const dashboard = await getDashboard(ana.id, { period: '30d' });
    expect(dashboard.events.map((show) => show.id)).toEqual(['show-a']);
    expect(queried).toEqual([['show-a']]);
  });

  it("hides another organizer's event as if it did not exist", async () => {
    await expect(getDashboard(ana.id, { period: '30d', eventId: 'show-b' })).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects a session whose account no longer exists', async () => {
    await expect(getDashboard('00000000-0000-4000-8000-000000000000', { period: '7d' })).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('sales projection', () => {
  it('stores only the masked email of the buyer', async () => {
    const recorded: Array<{ customerEmailMasked: string }> = [];
    const projection: SalesProjection = {
      recordCreated: async () => {},
      recordConfirmed: async (order) => {
        recorded.push(order);
      },
      recordCancelled: async () => {},
    };
    await makeSalesProjector(projection)['order.confirmed'](
      createEvent('order.confirmed', {
        orderId: '17f4f71f-1111-4111-8111-111111111111',
        eventId: 'show-a',
        seatIds: ['vip:1:1'],
        totalCents: 20000,
        customer: { name: 'Marina Costa', email: 'marina@example.com' },
        locale: 'pt',
      }),
    );
    expect(recorded[0]).toMatchObject({ customerEmailMasked: 'm***@example.com' });
    expect(JSON.stringify(recorded)).not.toContain('marina@example.com');
  });
});

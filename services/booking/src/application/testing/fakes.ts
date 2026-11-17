import type { DomainEvent, EventDetail } from '@plateia/contracts';
import type { Order } from '../../domain/order';
import type {
  AcquireResult,
  CatalogGateway,
  Clock,
  HoldRecord,
  HoldStore,
  OrderRepository,
  OrderTransaction,
  SeatNotifier,
} from '../ports';

/** In-memory implementations of the ports, used by the use case tests. */

export class FakeClock implements Clock {
  private current: Date;

  constructor(start = '2027-01-01T12:00:00.000Z') {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class InMemoryHoldStore implements HoldStore {
  private readonly holds = new Map<string, HoldRecord>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  private active(): HoldRecord[] {
    const now = this.clock.now().getTime();
    return [...this.holds.values()].filter((hold) => hold.expiresAt.getTime() > now);
  }

  async acquire(hold: Omit<HoldRecord, 'expiresAt'>, ttlMs: number): Promise<AcquireResult> {
    const taken = new Set(
      this.active()
        .filter((other) => other.eventId === hold.eventId)
        .flatMap((other) => other.seatIds),
    );
    const conflicts = hold.seatIds.filter((seatId) => taken.has(seatId));
    if (conflicts.length > 0) return { ok: false, conflicts };
    const expiresAt = new Date(this.clock.now().getTime() + ttlMs);
    this.holds.set(hold.holdId, { ...hold, expiresAt });
    return { ok: true, expiresAt };
  }

  async find(holdId: string): Promise<HoldRecord | null> {
    return this.active().find((hold) => hold.holdId === holdId) ?? null;
  }

  async findBySession(sessionId: string, eventId: string): Promise<HoldRecord | null> {
    return this.active().find((hold) => hold.sessionId === sessionId && hold.eventId === eventId) ?? null;
  }

  async extend(hold: HoldRecord, ttlMs: number): Promise<Date | null> {
    const current = await this.find(hold.holdId);
    if (!current) return null;
    current.expiresAt = new Date(this.clock.now().getTime() + ttlMs);
    return current.expiresAt;
  }

  async release(holdId: string): Promise<void> {
    this.holds.delete(holdId);
  }

  async listHeldSeats(eventId: string): Promise<string[]> {
    return this.active()
      .filter((hold) => hold.eventId === eventId)
      .flatMap((hold) => hold.seatIds);
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  readonly orders = new Map<string, Order>();
  /** `eventId|seatId` -> orderId */
  readonly tickets = new Map<string, string>();
  readonly published: DomainEvent[] = [];

  async createPending(order: Order, event: DomainEvent): Promise<Order> {
    const existing = await this.findByHoldId(order.holdId);
    if (existing) return existing;
    this.orders.set(order.id, order);
    this.published.push(event);
    return order;
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) ?? null;
  }

  async findByHoldId(holdId: string): Promise<Order | null> {
    return [...this.orders.values()].find((order) => order.holdId === holdId) ?? null;
  }

  async findSoldSeats(eventId: string, seatIds?: string[]): Promise<string[]> {
    const sold = [...this.tickets.keys()]
      .filter((key) => key.startsWith(`${eventId}|`))
      .map((key) => key.slice(eventId.length + 1));
    return seatIds ? sold.filter((seatId) => seatIds.includes(seatId)) : sold;
  }

  async findStalePendingIds(createdBefore: Date): Promise<string[]> {
    return [...this.orders.values()]
      .filter((order) => order.status === 'pending_payment' && order.createdAt < createdBefore)
      .map((order) => order.id);
  }

  async transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    const tx: OrderTransaction = {
      findForUpdate: (orderId) => this.findById(orderId),
      claimSeats: async (order) => {
        const keys = order.seatIds.map((seatId) => `${order.eventId}|${seatId}`);
        if (keys.some((key) => this.tickets.has(key))) return false;
        for (const key of keys) this.tickets.set(key, order.id);
        return true;
      },
      save: async (order) => {
        this.orders.set(order.id, order);
      },
      enqueue: async (event) => {
        this.published.push(event);
      },
    };
    return work(tx);
  }

  publishedTypes(): string[] {
    return this.published.map((event) => event.type);
  }
}

export class FakeCatalog implements CatalogGateway {
  private readonly events: EventDetail[];

  constructor(events: EventDetail[]) {
    this.events = events;
  }

  async getEvent(eventId: string): Promise<EventDetail | null> {
    return this.events.find((event) => event.id === eventId) ?? null;
  }
}

export class RecordingNotifier implements SeatNotifier {
  readonly notified: string[] = [];

  async seatsChanged(eventId: string): Promise<void> {
    this.notified.push(eventId);
  }
}

export function sequentialIds(): () => string {
  let counter = 0;
  return () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
}

export const sampleEvent: EventDetail = {
  id: 'show',
  title: 'Show',
  category: 'music',
  venue: 'Teatro',
  city: 'São Paulo, SP',
  startsAt: '2027-06-01T21:00:00.000Z',
  coverHue: 200,
  minPriceCents: 5000,
  description: { pt: 'Descrição', en: 'Description' },
  sections: [
    { id: 'vip', name: { pt: 'VIP', en: 'VIP' }, priceCents: 20000, rows: 2, seatsPerRow: 4 },
    { id: 'pista', name: { pt: 'Pista', en: 'Floor' }, priceCents: 5000, rows: 5, seatsPerRow: 10 },
  ],
};

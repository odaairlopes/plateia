import type { DomainEvent, EventDetail } from '@plateia/contracts';
import type { Order } from '../domain/order';

/**
 * Ports: what the use cases need from the outside world. Infrastructure
 * (Postgres, Redis, HTTP) implements them; tests use in-memory fakes.
 */

export interface HoldRecord {
  holdId: string;
  eventId: string;
  sessionId: string;
  seatIds: string[];
  totalCents: number;
  expiresAt: Date;
}

export type AcquireResult = { ok: true; expiresAt: Date } | { ok: false; conflicts: string[] };

export interface HoldStore {
  /** Atomically reserves every seat or none of them. */
  acquire(hold: Omit<HoldRecord, 'expiresAt'>, ttlMs: number): Promise<AcquireResult>;
  find(holdId: string): Promise<HoldRecord | null>;
  findBySession(sessionId: string, eventId: string): Promise<HoldRecord | null>;
  /** Returns the new expiry, or null when the hold is no longer intact. */
  extend(hold: HoldRecord, ttlMs: number): Promise<Date | null>;
  release(holdId: string): Promise<void>;
  listHeldSeats(eventId: string): Promise<string[]>;
}

/** Operations available inside one database transaction. */
export interface OrderTransaction {
  findForUpdate(orderId: string): Promise<Order | null>;
  /** Turns the order's seats into tickets. False when any seat is already sold. */
  claimSeats(order: Order): Promise<boolean>;
  save(order: Order): Promise<void>;
  enqueue(event: DomainEvent): Promise<void>;
}

export interface OrderRepository {
  /** Stores the order and its event atomically; returns the existing order on a repeated hold. */
  createPending(order: Order, event: DomainEvent): Promise<Order>;
  findById(orderId: string): Promise<Order | null>;
  findByHoldId(holdId: string): Promise<Order | null>;
  /** Sold seats of an event, optionally restricted to `seatIds`. */
  findSoldSeats(eventId: string, seatIds?: string[]): Promise<string[]>;
  findStalePendingIds(createdBefore: Date): Promise<string[]>;
  transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T>;
}

export interface CatalogGateway {
  getEvent(eventId: string): Promise<EventDetail | null>;
}

export interface SeatNotifier {
  seatsChanged(eventId: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

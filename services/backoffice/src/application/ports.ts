import type { CancelReason, EventDetail } from '@plateia/contracts';

export interface OrganizerAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface OrganizerRepository {
  findByEmail(email: string): Promise<OrganizerAccount | null>;
  findById(id: string): Promise<OrganizerAccount | null>;
  /** Ids of the events this organizer owns. */
  ownedEventIds(organizerId: string): Promise<string[]>;
}

export interface PasswordHasher {
  verify(hash: string, password: string): Promise<boolean>;
}

export interface CatalogReader {
  getEvent(eventId: string): Promise<EventDetail | null>;
}

/** Writes of the sales projection. Every operation is idempotent. */
export interface SalesProjection {
  recordCreated(order: {
    orderId: string;
    eventId: string;
    seatIds: string[];
    totalCents: number;
    at: Date;
  }): Promise<void>;
  recordConfirmed(order: {
    orderId: string;
    eventId: string;
    seatIds: string[];
    totalCents: number;
    customerName: string;
    customerEmailMasked: string;
    at: Date;
  }): Promise<void>;
  recordCancelled(order: { orderId: string; reason: CancelReason; at: Date }): Promise<void>;
}

export type Outcome = 'confirmed' | CancelReason;

/** Raw aggregates straight from the read model; the domain turns them into a dashboard. */
export interface SalesAggregates {
  totals: { revenueCents: number; orders: number; tickets: number };
  outcomes: Partial<Record<Outcome, number>>;
  byDay: Array<{ date: string; revenueCents: number; tickets: number }>;
  byEvent: Array<{ eventId: string; revenueCents: number; tickets: number }>;
  soldToDateBySection: Array<{ eventId: string; sectionId: string; sold: number }>;
  heatmap: Array<{ weekday: number; hour: number; orders: number }>;
  recent: Array<{
    orderId: string;
    eventId: string;
    seatIds: string[];
    totalCents: number;
    customerName: string;
    customerEmailMasked: string;
    confirmedAt: Date;
  }>;
}

export interface SalesReadModel {
  aggregate(query: { eventIds: string[]; from: Date | null; timeZone: string }): Promise<SalesAggregates>;
}

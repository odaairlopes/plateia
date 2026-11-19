import {
  VENUE_TIME_ZONE,
  type Dashboard,
  type DashboardQuery,
  type EventDetail,
  type EventOf,
  type Organizer,
} from '@plateia/contracts';
import { DomainError, notFound } from '@plateia/platform';
import { buildDashboard, periodStart } from '../domain/dashboard';
import { maskEmail } from '../domain/privacy';
import type {
  CatalogReader,
  OrganizerAccount,
  OrganizerRepository,
  PasswordHasher,
  SalesProjection,
  SalesReadModel,
} from './ports';

const toOrganizer = (account: OrganizerAccount): Organizer => ({
  id: account.id,
  name: account.name,
  email: account.email,
});

export interface AuthDeps {
  organizers: OrganizerRepository;
  hasher: PasswordHasher;
  /** A valid hash of a throwaway password, verified when the email is unknown. */
  dummyHash: string;
}

/**
 * Same error and roughly the same time whether the email exists or the
 * password is wrong: the endpoint must not reveal which emails have accounts.
 */
export function makeLogin(deps: AuthDeps) {
  return async function login(email: string, password: string): Promise<Organizer> {
    const account = await deps.organizers.findByEmail(email.trim().toLowerCase());
    const valid = await deps.hasher.verify(account?.passwordHash ?? deps.dummyHash, password);
    if (!account || !valid) throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    return toOrganizer(account);
  };
}

export function makeCurrentOrganizer(organizers: OrganizerRepository) {
  return async function currentOrganizer(organizerId: string): Promise<Organizer> {
    const account = await organizers.findById(organizerId);
    // The session outlived the account: treat it as logged out.
    if (!account) throw new DomainError('UNAUTHENTICATED', 'Session is no longer valid', 401);
    return toOrganizer(account);
  };
}

export interface DashboardDeps {
  organizers: OrganizerRepository;
  catalog: CatalogReader;
  sales: SalesReadModel;
  clock: () => Date;
}

export function makeGetDashboard(deps: DashboardDeps) {
  const currentOrganizer = makeCurrentOrganizer(deps.organizers);

  return async function getDashboard(organizerId: string, query: DashboardQuery): Promise<Dashboard> {
    const organizer = await currentOrganizer(organizerId);
    const ownedIds = await deps.organizers.ownedEventIds(organizerId);

    // Authorization: an organizer only ever sees their own events. Another
    // organizer's event answers exactly like a missing one.
    if (query.eventId && !ownedIds.includes(query.eventId)) {
      throw notFound('EVENT_NOT_FOUND', 'Event not found');
    }

    const ownedEvents = (await Promise.all(ownedIds.map((id) => deps.catalog.getEvent(id)))).filter(
      (event): event is EventDetail => event !== null,
    );
    const scopeEvents = query.eventId ? ownedEvents.filter((event) => event.id === query.eventId) : ownedEvents;
    const now = deps.clock();

    const aggregates = await deps.sales.aggregate({
      eventIds: scopeEvents.map((event) => event.id),
      from: periodStart(query.period, now),
      timeZone: VENUE_TIME_ZONE,
    });

    return buildDashboard({
      organizer,
      ownedEvents,
      scopeEvents,
      selectedEventId: query.eventId ?? null,
      period: query.period,
      now,
      timeZone: VENUE_TIME_ZONE,
      aggregates,
    });
  };
}

/**
 * Keeps the sales read model in sync with the order lifecycle. Each handler
 * is idempotent, so replaying the stream rebuilds the same projection.
 */
export function makeSalesProjector(projection: SalesProjection) {
  return {
    'order.created': (event: EventOf<'order.created'>) =>
      projection.recordCreated({
        orderId: event.payload.orderId,
        eventId: event.payload.eventId,
        seatIds: event.payload.seatIds,
        totalCents: event.payload.totalCents,
        at: new Date(event.occurredAt),
      }),
    'order.confirmed': (event: EventOf<'order.confirmed'>) =>
      projection.recordConfirmed({
        orderId: event.payload.orderId,
        eventId: event.payload.eventId,
        seatIds: event.payload.seatIds,
        totalCents: event.payload.totalCents,
        customerName: event.payload.customer.name,
        customerEmailMasked: maskEmail(event.payload.customer.email),
        at: new Date(event.occurredAt),
      }),
    'order.cancelled': (event: EventOf<'order.cancelled'>) =>
      projection.recordCancelled({
        orderId: event.payload.orderId,
        reason: event.payload.reason,
        at: new Date(event.occurredAt),
      }),
  };
}

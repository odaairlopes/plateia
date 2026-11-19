import type { Dashboard, DashboardPeriod, EventDetail, Organizer } from '@plateia/contracts';
import type { SalesAggregates } from '../application/ports';
import { shortName } from './privacy';

const DAY_MS = 24 * 60 * 60_000;
const PERIOD_DAYS: Record<Exclude<DashboardPeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Start of the period, or null for "all time". */
export function periodStart(period: DashboardPeriod, now: Date): Date | null {
  return period === 'all' ? null : new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);
}

/** Calendar date (YYYY-MM-DD) of an instant in a given time zone. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  );
}

/** Every calendar day from `first` to `last` inclusive, so days without sales show as zero instead of disappearing. */
function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = new Date(`${first}T12:00:00Z`); localIso(day) <= last; day = new Date(day.getTime() + DAY_MS)) {
    days.push(localIso(day));
  }
  return days;
}

const localIso = (date: Date) => date.toISOString().slice(0, 10);

const capacityOf = (event: EventDetail) =>
  event.sections.reduce((total, section) => total + section.rows * section.seatsPerRow, 0);

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export interface BuildDashboardInput {
  organizer: Organizer;
  ownedEvents: EventDetail[];
  /** The events the dashboard covers: all owned events or the selected one. */
  scopeEvents: EventDetail[];
  selectedEventId: string | null;
  period: DashboardPeriod;
  now: Date;
  timeZone: string;
  aggregates: SalesAggregates;
}

/**
 * Turns raw aggregates into what the dashboard shows. Kept free of I/O so the
 * business rules of the numbers (what counts as revenue, how occupancy and
 * conversion are defined, how gaps are filled) are unit tested.
 */
export function buildDashboard(input: BuildDashboardInput): Dashboard {
  const { aggregates, scopeEvents, timeZone, now, period } = input;
  const from = periodStart(period, now);
  const titleOf = new Map(input.ownedEvents.map((event) => [event.id, event.title]));

  // Days: the whole period for fixed periods, from the first sale for "all".
  const salesByDate = new Map(aggregates.byDay.map((day) => [day.date, day]));
  const firstDay = from ? localDate(from, timeZone) : (aggregates.byDay[0]?.date ?? localDate(now, timeZone));
  const salesByDay = daysBetween(firstDay, localDate(now, timeZone)).map((date) => ({
    date,
    revenueCents: salesByDate.get(date)?.revenueCents ?? 0,
    tickets: salesByDate.get(date)?.tickets ?? 0,
  }));

  const soldBySection = new Map(
    aggregates.soldToDateBySection.map((row) => [`${row.eventId}|${row.sectionId}`, row.sold]),
  );
  const bySection = scopeEvents.flatMap((event) =>
    event.sections.map((section) => ({
      eventId: event.id,
      eventTitle: event.title,
      sectionId: section.id,
      name: section.name,
      priceCents: section.priceCents,
      soldToDate: soldBySection.get(`${event.id}|${section.id}`) ?? 0,
      capacity: section.rows * section.seatsPerRow,
    })),
  );

  const periodByEvent = new Map(aggregates.byEvent.map((row) => [row.eventId, row]));
  const byEvent = scopeEvents
    .map((event) => ({
      eventId: event.id,
      title: event.title,
      revenueCents: periodByEvent.get(event.id)?.revenueCents ?? 0,
      tickets: periodByEvent.get(event.id)?.tickets ?? 0,
      soldToDate: bySection.filter((row) => row.eventId === event.id).reduce((sum, row) => sum + row.soldToDate, 0),
      capacity: capacityOf(event),
    }))
    .toSorted((a, b) => b.revenueCents - a.revenueCents);

  const capacity = byEvent.reduce((sum, event) => sum + event.capacity, 0);
  const soldToDate = byEvent.reduce((sum, event) => sum + event.soldToDate, 0);

  const outcomes = {
    confirmed: aggregates.outcomes.confirmed ?? 0,
    payment_declined: aggregates.outcomes.payment_declined ?? 0,
    expired: aggregates.outcomes.expired ?? 0,
    seat_conflict: aggregates.outcomes.seat_conflict ?? 0,
  };
  const cancelledOrders = outcomes.payment_declined + outcomes.expired + outcomes.seat_conflict;
  const { revenueCents, orders, tickets } = aggregates.totals;

  return {
    organizer: input.organizer,
    events: input.ownedEvents
      .map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt }))
      .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt)),
    scope: {
      eventId: input.selectedEventId,
      period,
      from: from?.toISOString() ?? null,
      to: now.toISOString(),
      timeZone,
    },
    kpis: {
      revenueCents,
      ticketsSold: tickets,
      ordersConfirmed: orders,
      averageTicketCents: tickets > 0 ? Math.round(revenueCents / tickets) : 0,
      conversionRate: ratio(outcomes.confirmed, outcomes.confirmed + cancelledOrders),
      cancelledOrders,
      occupancy: ratio(soldToDate, capacity),
      capacity,
    },
    salesByDay,
    byEvent,
    bySection,
    outcomes,
    heatmap: aggregates.heatmap,
    recentOrders: aggregates.recent.map((order) => ({
      code: order.orderId.slice(0, 8).toUpperCase(),
      eventId: order.eventId,
      eventTitle: titleOf.get(order.eventId) ?? order.eventId,
      seatIds: order.seatIds,
      totalCents: order.totalCents,
      buyer: shortName(order.customerName),
      emailMasked: order.customerEmailMasked,
      confirmedAt: order.confirmedAt.toISOString(),
    })),
  };
}

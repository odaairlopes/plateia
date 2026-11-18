import { z } from 'zod';
import { cancelReasonSchema, eventIdParamsSchema, localizedTextSchema } from './api';

/** Contracts of the organizer back office (authenticated, cookie session). */

export const loginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const organizerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
});
export type Organizer = z.infer<typeof organizerSchema>;

export const dashboardPeriodSchema = z.enum(['7d', '30d', '90d', 'all']);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

export const dashboardQuerySchema = z.object({
  eventId: eventIdParamsSchema.shape.eventId.optional(),
  period: dashboardPeriodSchema.default('30d'),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const money = z.number().int();

export const dashboardSchema = z.object({
  organizer: organizerSchema,
  /** Every event the organizer owns, for the event selector. */
  events: z.array(z.object({ id: z.string(), title: z.string(), startsAt: z.string() })),
  scope: z.object({
    eventId: z.string().nullable(),
    period: dashboardPeriodSchema,
    /** Start of the period (null for "all"), end is always "now". */
    from: z.string().nullable(),
    to: z.string(),
    timeZone: z.string(),
  }),
  kpis: z.object({
    revenueCents: money,
    ticketsSold: z.number().int(),
    ordersConfirmed: z.number().int(),
    averageTicketCents: money,
    /** Settled orders that were confirmed (0..1). */
    conversionRate: z.number(),
    cancelledOrders: z.number().int(),
    /** Seats sold so far / capacity, whatever the period (0..1). */
    occupancy: z.number(),
    capacity: z.number().int(),
  }),
  salesByDay: z.array(z.object({ date: z.string(), revenueCents: money, tickets: z.number().int() })),
  byEvent: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      revenueCents: money,
      tickets: z.number().int(),
      soldToDate: z.number().int(),
      capacity: z.number().int(),
    }),
  ),
  bySection: z.array(
    z.object({
      eventId: z.string(),
      eventTitle: z.string(),
      sectionId: z.string(),
      name: localizedTextSchema,
      priceCents: money,
      soldToDate: z.number().int(),
      capacity: z.number().int(),
    }),
  ),
  outcomes: z.object({
    confirmed: z.number().int(),
    payment_declined: z.number().int(),
    expired: z.number().int(),
    seat_conflict: z.number().int(),
  }),
  /** Confirmed orders by weekday (0 = Sunday) and hour, in the venue time zone. */
  heatmap: z.array(z.object({ weekday: z.number().int(), hour: z.number().int(), orders: z.number().int() })),
  recentOrders: z.array(
    z.object({
      code: z.string(),
      eventId: z.string(),
      eventTitle: z.string(),
      seatIds: z.array(z.string()),
      totalCents: money,
      buyer: z.string(),
      emailMasked: z.string(),
      confirmedAt: z.string(),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const outcomeKeys = ['confirmed', ...cancelReasonSchema.options] as const;

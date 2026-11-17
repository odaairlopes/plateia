import { z } from 'zod';
import { MAX_SEATS_PER_HOLD } from './seat';

/** HTTP contracts shared by services (runtime validation) and web apps (types). */

export const localeSchema = z.enum(['pt', 'en']);
export type Locale = z.infer<typeof localeSchema>;

export const localizedTextSchema = z.object({ pt: z.string(), en: z.string() });
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const eventCategorySchema = z.enum(['music', 'theater', 'comedy', 'festival']);
export type EventCategory = z.infer<typeof eventCategorySchema>;

export const sectionSchema = z.object({
  id: z.string(),
  name: localizedTextSchema,
  priceCents: z.number().int().nonnegative(),
  rows: z.number().int().min(1).max(26),
  seatsPerRow: z.number().int().min(1).max(40),
});
export type Section = z.infer<typeof sectionSchema>;

export const eventSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: eventCategorySchema,
  venue: z.string(),
  city: z.string(),
  startsAt: z.string(),
  coverHue: z.number().int().min(0).max(360),
  minPriceCents: z.number().int().nonnegative(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

export const eventDetailSchema = eventSummarySchema.extend({
  description: localizedTextSchema,
  sections: z.array(sectionSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const eventIdParamsSchema = z.object({
  eventId: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});

export const seatMapSchema = z.object({
  eventId: z.string(),
  sold: z.array(z.string()),
  held: z.array(z.string()),
});
export type SeatMap = z.infer<typeof seatMapSchema>;

export const holdRequestSchema = z.object({
  eventId: eventIdParamsSchema.shape.eventId,
  seatIds: z.array(z.string().max(60)).min(1).max(MAX_SEATS_PER_HOLD),
});
export type HoldRequest = z.infer<typeof holdRequestSchema>;

export const holdSchema = z.object({
  holdId: z.uuid(),
  eventId: z.string(),
  seatIds: z.array(z.string()),
  totalCents: z.number().int().nonnegative(),
  expiresAt: z.string(),
});
export type Hold = z.infer<typeof holdSchema>;

/** The payment provider is simulated; the scenario makes the demo deterministic. */
export const paymentScenarioSchema = z.enum(['approve', 'decline']);
export type PaymentScenario = z.infer<typeof paymentScenarioSchema>;

export const createOrderSchema = z.object({
  holdId: z.uuid(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
  }),
  paymentScenario: paymentScenarioSchema,
  /** Language of the confirmation email. */
  locale: localeSchema.default('pt'),
});
export type CreateOrderRequest = z.infer<typeof createOrderSchema>;

export const orderStatusSchema = z.enum(['pending_payment', 'confirmed', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const cancelReasonSchema = z.enum(['payment_declined', 'seat_conflict', 'expired']);
export type CancelReason = z.infer<typeof cancelReasonSchema>;

export const orderSchema = z.object({
  id: z.uuid(),
  eventId: z.string(),
  seatIds: z.array(z.string()),
  totalCents: z.number().int().nonnegative(),
  status: orderStatusSchema,
  cancelReason: cancelReasonSchema.nullable(),
  customerName: z.string(),
  createdAt: z.string(),
});
export type OrderDto = z.infer<typeof orderSchema>;

export const problemSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export const SESSION_HEADER = 'x-session-id';
export const sessionHeadersSchema = z.object({ [SESSION_HEADER]: z.uuid() });

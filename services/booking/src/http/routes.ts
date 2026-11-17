import { z } from 'zod';
import {
  createOrderSchema,
  eventIdParamsSchema,
  holdRequestSchema,
  holdSchema,
  orderSchema,
  problemSchema,
  seatMapSchema,
  SESSION_HEADER,
  sessionHeadersSchema,
  type CreateOrderRequest,
  type Hold,
  type HoldRequest,
} from '@plateia/contracts';
import { notFound, type App } from '@plateia/platform';
import type { HoldStore, OrderRepository } from '../application/ports';
import { toOrderDto, type Order } from '../domain/order';
import type { SeatBroadcaster } from '../infra/seat-broadcaster';

export interface BookingRouteDeps {
  holds: HoldStore;
  orders: OrderRepository;
  broadcaster: SeatBroadcaster;
  streamGauge: { opened(): void; closed(): void };
  holdSeats(input: HoldRequest & { sessionId: string }): Promise<Hold>;
  releaseHold(input: { sessionId: string; holdId: string }): Promise<void>;
  createOrder(input: CreateOrderRequest & { sessionId: string }): Promise<Order>;
}

// Writes are far more expensive than reads and are the target of abuse.
const WRITE_LIMIT = { rateLimit: { max: 30, timeWindow: '1 minute' } };
const HEARTBEAT_MS = 25_000;

export function registerBookingRoutes(app: App, deps: BookingRouteDeps): void {
  app.get(
    '/events/:eventId/seats',
    {
      schema: {
        tags: ['seats'],
        summary: 'Seats that are sold or temporarily held',
        params: eventIdParamsSchema,
        response: { 200: seatMapSchema },
      },
    },
    async (request) => {
      const { eventId } = request.params;
      const [sold, held] = await Promise.all([deps.orders.findSoldSeats(eventId), deps.holds.listHeldSeats(eventId)]);
      return { eventId, sold, held };
    },
  );

  app.get(
    '/events/:eventId/seats/stream',
    {
      schema: {
        tags: ['seats'],
        summary: 'Server-Sent Events: emits "seats-changed" whenever availability changes',
        params: eventIdParamsSchema,
      },
    },
    (request, reply) => {
      // Raw response: keep the headers Fastify already computed (CORS).
      reply.hijack();
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      reply.raw.write('retry: 3000\n\n');

      const unsubscribe = deps.broadcaster.subscribe(request.params.eventId, () => {
        reply.raw.write('event: seats-changed\ndata: {}\n\n');
      });
      deps.streamGauge.opened();
      const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), HEARTBEAT_MS);

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
        deps.streamGauge.closed();
      });
    },
  );

  app.post(
    '/holds',
    {
      config: WRITE_LIMIT,
      schema: {
        tags: ['holds'],
        summary: 'Temporarily reserve seats (all or nothing)',
        headers: sessionHeadersSchema,
        body: holdRequestSchema,
        response: { 201: holdSchema, 404: problemSchema, 409: problemSchema, 422: problemSchema },
      },
    },
    async (request, reply) => {
      const hold = await deps.holdSeats({ ...request.body, sessionId: request.headers[SESSION_HEADER] });
      return reply.status(201).send(hold);
    },
  );

  app.delete(
    '/holds/:holdId',
    {
      config: WRITE_LIMIT,
      schema: {
        tags: ['holds'],
        summary: 'Release a hold before it expires',
        headers: sessionHeadersSchema,
        params: z.object({ holdId: z.uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await deps.releaseHold({ holdId: request.params.holdId, sessionId: request.headers[SESSION_HEADER] });
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/orders',
    {
      config: WRITE_LIMIT,
      schema: {
        tags: ['orders'],
        summary: 'Check out a hold. Accepted asynchronously: poll the order for the outcome',
        headers: sessionHeadersSchema,
        body: createOrderSchema,
        response: { 202: orderSchema, 410: problemSchema },
      },
    },
    async (request, reply) => {
      const order = await deps.createOrder({ ...request.body, sessionId: request.headers[SESSION_HEADER] });
      return reply.status(202).send(toOrderDto(order));
    },
  );

  app.get(
    '/orders/:orderId',
    {
      schema: {
        tags: ['orders'],
        summary: 'Order status (only visible to the session that created it)',
        headers: sessionHeadersSchema,
        params: z.object({ orderId: z.uuid() }),
        response: { 200: orderSchema, 404: problemSchema },
      },
    },
    async (request, reply) => {
      const order = await deps.orders.findById(request.params.orderId);
      // Same answer for "does not exist" and "not yours": no information leak.
      if (!order || order.sessionId !== request.headers[SESSION_HEADER]) {
        throw notFound('ORDER_NOT_FOUND', 'Order not found');
      }
      reply.header('cache-control', 'no-store');
      return toOrderDto(order);
    },
  );
}

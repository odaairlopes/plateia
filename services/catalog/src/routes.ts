import { z } from 'zod';
import { eventDetailSchema, eventIdParamsSchema, eventSummarySchema, problemSchema } from '@plateia/contracts';
import { notFound, type App } from '@plateia/platform';
import type { CatalogRepository } from './repository';

// The catalog changes rarely; a short shared cache absorbs read spikes on sale openings.
const CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60';

export function registerCatalogRoutes(app: App, repository: CatalogRepository): void {
  app.get(
    '/events',
    {
      schema: {
        tags: ['events'],
        summary: 'List upcoming events',
        response: { 200: z.array(eventSummarySchema) },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', CACHE_CONTROL);
      return repository.listEvents();
    },
  );

  app.get(
    '/events/:eventId',
    {
      schema: {
        tags: ['events'],
        summary: 'Event details with its seating sections',
        params: eventIdParamsSchema,
        response: { 200: eventDetailSchema, 404: problemSchema },
      },
    },
    async (request, reply) => {
      const event = await repository.findEvent(request.params.eventId);
      if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found');
      reply.header('cache-control', CACHE_CONTROL);
      return event;
    },
  );
}

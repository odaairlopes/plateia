import type { EventDetail, EventSummary } from '@plateia/contracts';
import { apiConfig, apiRequest } from '@plateia/web-kit';
import { queryOptions } from '@tanstack/react-query';

/** Query definitions in one place: components never build URLs or cache keys. */

export const eventsQuery = queryOptions({
  queryKey: ['catalog', 'events'],
  queryFn: ({ signal }) => apiRequest<EventSummary[]>(`${apiConfig.catalogUrl}/events`, { signal }),
  staleTime: 60_000,
});

export const eventQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['catalog', 'event', eventId],
    queryFn: ({ signal }) =>
      apiRequest<EventDetail>(`${apiConfig.catalogUrl}/events/${encodeURIComponent(eventId)}`, { signal }),
    staleTime: 60_000,
  });

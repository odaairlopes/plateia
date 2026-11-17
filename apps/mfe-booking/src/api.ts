import type { CreateOrderRequest, EventDetail, Hold, OrderDto, SeatMap } from '@plateia/contracts';
import { apiConfig, apiRequest } from '@plateia/web-kit';
import { queryOptions } from '@tanstack/react-query';

const { bookingUrl, catalogUrl } = apiConfig;

/**
 * Same cache key the catalog micro frontend uses. The query client is a shared
 * singleton, so arriving here from the event page reuses the cached event —
 * the remotes cooperate without importing each other's code.
 */
export const eventQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['catalog', 'event', eventId],
    queryFn: ({ signal }) =>
      apiRequest<EventDetail>(`${catalogUrl}/events/${encodeURIComponent(eventId)}`, { signal }),
    staleTime: 60_000,
  });

export const seatMapKey = (eventId: string) => ['booking', 'seats', eventId] as const;

export const seatMapQuery = (eventId: string) =>
  queryOptions({
    queryKey: seatMapKey(eventId),
    queryFn: ({ signal }) =>
      apiRequest<SeatMap>(`${bookingUrl}/events/${encodeURIComponent(eventId)}/seats`, { signal }),
    staleTime: 0,
    // Safety net: holds that expire by TTL emit no event.
    refetchInterval: 20_000,
  });

export const seatStreamUrl = (eventId: string) =>
  `${bookingUrl}/events/${encodeURIComponent(eventId)}/seats/stream`;

export const createHold = (eventId: string, seatIds: string[]) =>
  apiRequest<Hold>(`${bookingUrl}/holds`, { method: 'POST', body: { eventId, seatIds } });

export const releaseHold = (holdId: string) =>
  apiRequest<void>(`${bookingUrl}/holds/${encodeURIComponent(holdId)}`, { method: 'DELETE' });

export const createOrder = (request: CreateOrderRequest) =>
  apiRequest<OrderDto>(`${bookingUrl}/orders`, { method: 'POST', body: request });

export const orderQuery = (orderId: string) =>
  queryOptions({
    queryKey: ['booking', 'order', orderId],
    queryFn: ({ signal }) =>
      apiRequest<OrderDto>(`${bookingUrl}/orders/${encodeURIComponent(orderId)}`, { signal }),
    staleTime: 0,
  });

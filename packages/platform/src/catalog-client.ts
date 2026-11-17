import { eventDetailSchema, type EventDetail } from '@plateia/contracts';
import { DomainError } from './errors';

export interface CatalogClient {
  getEvent(eventId: string): Promise<EventDetail | null>;
}

interface CacheEntry {
  event: EventDetail | null;
  fetchedAt: number;
}

const FRESH_MS = 30_000;
const TIMEOUT_MS = 2_000;
const MAX_ENTRIES = 500;

/**
 * Several services need data the catalog owns (prices, layouts, dates). The call is
 * synchronous, so it is protected: a short timeout, a small cache, and
 * serving the last known answer when the catalog is down (stale-if-error),
 * which keeps checkout (and notifications) working through a catalog outage.
 *
 * Trade-off: a change takes up to 30s to reach the caller. The next step
 * would be replicating the catalog through events instead of calling it.
 */
export function createHttpCatalogClient(baseUrl: string): CatalogClient {
  const cache = new Map<string, CacheEntry>();

  function remember(eventId: string, event: EventDetail | null): void {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(eventId, { event, fetchedAt: Date.now() });
  }

  return {
    async getEvent(eventId) {
      const cached = cache.get(eventId);
      if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return cached.event;

      try {
        const response = await fetch(`${baseUrl}/events/${encodeURIComponent(eventId)}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 404) {
          remember(eventId, null);
          return null;
        }
        if (!response.ok) throw new Error(`Catalog answered ${response.status}`);
        const event = eventDetailSchema.parse(await response.json());
        remember(eventId, event);
        return event;
      } catch (error) {
        if (cached) return cached.event;
        throw new DomainError('CATALOG_UNAVAILABLE', 'Catalog is temporarily unavailable', 503, {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

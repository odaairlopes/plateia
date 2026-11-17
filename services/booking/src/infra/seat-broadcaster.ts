import { Redis } from 'ioredis';
import type { SeatNotifier } from '../application/ports';

const CHANNEL = 'plateia:seats-changed';

interface Logger {
  warn(obj: object, msg?: string): void;
}

export interface SeatBroadcaster extends SeatNotifier {
  /** Calls `listener` whenever seats of `eventId` change. Returns the unsubscribe function. */
  subscribe(eventId: string, listener: () => void): () => void;
  close(): Promise<void>;
}

/**
 * Fans "seats changed" signals out to every replica through Redis Pub/Sub, so
 * a browser connected to instance A learns about a hold made on instance B.
 * The message carries no state: clients just refetch the seat map, which keeps
 * the stream trivially correct even if a message is lost.
 */
export function createSeatBroadcaster(redisUrl: string, logger: Logger): SeatBroadcaster {
  const publisher = new Redis(redisUrl);
  const subscriber = new Redis(redisUrl);
  const listeners = new Map<string, Set<() => void>>();

  void subscriber.subscribe(CHANNEL);
  subscriber.on('message', (_channel: string, eventId: string) => {
    for (const listener of listeners.get(eventId) ?? []) listener();
  });

  return {
    async seatsChanged(eventId) {
      try {
        await publisher.publish(CHANNEL, eventId);
      } catch (error) {
        // A missed notification must never fail a booking.
        logger.warn({ err: error, eventId }, 'could not broadcast seat change');
      }
    },

    subscribe(eventId, listener) {
      const set = listeners.get(eventId) ?? new Set();
      set.add(listener);
      listeners.set(eventId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(eventId);
      };
    },

    async close() {
      publisher.disconnect();
      subscriber.disconnect();
    },
  };
}

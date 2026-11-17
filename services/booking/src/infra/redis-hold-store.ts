import type { Redis } from 'ioredis';
import type { AcquireResult, HoldRecord, HoldStore } from '../application/ports';

/**
 * Seat holds on Redis.
 *
 * Each held seat is a key with a TTL, so an abandoned checkout frees its seats
 * with no cleanup job. Reserving several seats must be all-or-nothing, which
 * is why every multi-key operation runs as a Lua script: Redis executes a
 * script atomically, so two visitors can never interleave on the same seats.
 *
 * Key layout (KEYS[1..3] are fixed, seat keys follow):
 *   meta    plateia:hold:meta:<holdId>              JSON of the hold
 *   index   plateia:hold:index:<eventId>            ZSET seatId -> expiry (ms)
 *   session plateia:hold:session:<sessionId>:<evt>  holdId of the visitor
 *   seat    plateia:hold:seat:<eventId>:<seatId>    holdId that owns the seat
 */

const ACQUIRE = `
local conflicts = {}
for i = 4, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then conflicts[#conflicts + 1] = ARGV[i + 1] end
end
if #conflicts > 0 then return conflicts end
for i = 4, #KEYS do
  redis.call('SET', KEYS[i], ARGV[1], 'PX', ARGV[2])
  redis.call('ZADD', KEYS[2], ARGV[4], ARGV[i + 1])
end
redis.call('SET', KEYS[1], ARGV[3], 'PX', ARGV[2])
redis.call('SET', KEYS[3], ARGV[1], 'PX', ARGV[2])
return conflicts
`;

const EXTEND = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
for i = 4, #KEYS do
  if redis.call('GET', KEYS[i]) ~= ARGV[1] then return 0 end
end
for i = 4, #KEYS do
  redis.call('PEXPIRE', KEYS[i], ARGV[2])
  redis.call('ZADD', KEYS[2], ARGV[3], ARGV[i])
end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
if redis.call('GET', KEYS[3]) == ARGV[1] then redis.call('PEXPIRE', KEYS[3], ARGV[2]) end
return 1
`;

const RELEASE = `
for i = 4, #KEYS do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    redis.call('DEL', KEYS[i])
    redis.call('ZREM', KEYS[2], ARGV[i - 2])
  end
end
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[3]) == ARGV[1] then redis.call('DEL', KEYS[3]) end
return 1
`;

type StoredHold = Omit<HoldRecord, 'expiresAt'>;

const metaKey = (holdId: string) => `plateia:hold:meta:${holdId}`;
const indexKey = (eventId: string) => `plateia:hold:index:${eventId}`;
const sessionKey = (sessionId: string, eventId: string) => `plateia:hold:session:${sessionId}:${eventId}`;
const seatKey = (eventId: string, seatId: string) => `plateia:hold:seat:${eventId}:${seatId}`;

function keysOf(hold: StoredHold): string[] {
  return [
    metaKey(hold.holdId),
    indexKey(hold.eventId),
    sessionKey(hold.sessionId, hold.eventId),
    ...hold.seatIds.map((seatId) => seatKey(hold.eventId, seatId)),
  ];
}

export function createRedisHoldStore(redis: Redis): HoldStore {
  async function find(holdId: string): Promise<HoldRecord | null> {
    const [raw, ttlMs] = await Promise.all([redis.get(metaKey(holdId)), redis.pttl(metaKey(holdId))]);
    if (!raw || ttlMs <= 0) return null;
    const stored = JSON.parse(raw) as StoredHold;
    return { ...stored, expiresAt: new Date(Date.now() + ttlMs) };
  }

  return {
    find,

    async acquire(hold, ttlMs): Promise<AcquireResult> {
      const stored: StoredHold = {
        holdId: hold.holdId,
        eventId: hold.eventId,
        sessionId: hold.sessionId,
        seatIds: hold.seatIds,
        totalCents: hold.totalCents,
      };
      const expiresAt = Date.now() + ttlMs;
      const keys = keysOf(stored);
      const conflicts = (await redis.eval(
        ACQUIRE,
        keys.length,
        ...keys,
        hold.holdId,
        ttlMs,
        JSON.stringify(stored),
        expiresAt,
        ...hold.seatIds,
      )) as string[];
      return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true, expiresAt: new Date(expiresAt) };
    },

    async findBySession(sessionId, eventId) {
      const holdId = await redis.get(sessionKey(sessionId, eventId));
      return holdId ? find(holdId) : null;
    },

    async extend(hold, ttlMs) {
      const expiresAt = Date.now() + ttlMs;
      const keys = keysOf(hold);
      const extended = await redis.eval(EXTEND, keys.length, ...keys, hold.holdId, ttlMs, expiresAt, ...hold.seatIds);
      return extended === 1 ? new Date(expiresAt) : null;
    },

    async release(holdId) {
      const hold = await find(holdId);
      if (!hold) return;
      const keys = keysOf(hold);
      await redis.eval(RELEASE, keys.length, ...keys, hold.holdId, ...hold.seatIds);
    },

    async listHeldSeats(eventId) {
      const now = Date.now();
      // Expired seats leave the index lazily, here.
      await redis.zremrangebyscore(indexKey(eventId), '-inf', now);
      return redis.zrangebyscore(indexKey(eventId), now, '+inf');
    },
  };
}

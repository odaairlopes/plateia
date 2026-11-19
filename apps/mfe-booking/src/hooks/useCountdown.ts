import { useEffect, useEffectEvent, useState } from 'react';

const remaining = (expiresAt: string) => Math.max(0, new Date(expiresAt).getTime() - Date.now());

/** Milliseconds left until `expiresAt`, updated every second. Calls `onExpire` once at zero. */
export function useCountdown(expiresAt: string, onExpire: () => void): number {
  const [remainingMs, setRemainingMs] = useState(() => remaining(expiresAt));
  // Always calls the latest onExpire without restarting the interval when the
  // parent passes a new function (writing a ref during render is not allowed).
  const expire = useEffectEvent(onExpire);

  useEffect(() => {
    const tick = () => {
      const left = remaining(expiresAt);
      setRemainingMs(left);
      if (left === 0) {
        clearInterval(timer);
        expire();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [expiresAt]);

  return remainingMs;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

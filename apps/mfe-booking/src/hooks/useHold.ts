import type { Hold } from '@plateia/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { createHold, releaseHold, seatMapKey } from '../api';

const storageKey = (eventId: string) => `plateia.hold.${eventId}`;

function readStoredHold(eventId: string): Hold | null {
  try {
    const raw = sessionStorage.getItem(storageKey(eventId));
    if (!raw) return null;
    const hold = JSON.parse(raw) as Hold;
    return new Date(hold.expiresAt).getTime() > Date.now() ? hold : null;
  } catch {
    return null;
  }
}

function storeHold(eventId: string, hold: Hold | null): void {
  try {
    if (hold) sessionStorage.setItem(storageKey(eventId), JSON.stringify(hold));
    else sessionStorage.removeItem(storageKey(eventId));
  } catch {
    // storage unavailable: the hold simply does not survive a reload
  }
}

/**
 * The visitor's current hold for an event. It is mirrored to sessionStorage so
 * an accidental reload during checkout does not lose the reserved seats.
 */
export function useHold(eventId: string) {
  const queryClient = useQueryClient();
  const [hold, setHoldState] = useState<Hold | null>(() => readStoredHold(eventId));

  const setHold = useCallback(
    (next: Hold | null) => {
      storeHold(eventId, next);
      setHoldState(next);
    },
    [eventId],
  );

  const refreshSeats = () => void queryClient.invalidateQueries({ queryKey: seatMapKey(eventId) });

  const reserveMutation = useMutation({
    mutationFn: (seatIds: string[]) => createHold(eventId, seatIds),
    onSuccess: setHold,
    onSettled: refreshSeats,
  });

  const releaseMutation = useMutation({
    mutationFn: (holdId: string) => releaseHold(holdId),
    onSettled: refreshSeats,
  });

  return {
    hold,
    reserve: reserveMutation.mutateAsync,
    isReserving: reserveMutation.isPending,
    /** Gives the seats back to everyone else right away. */
    release: () => {
      if (hold) releaseMutation.mutate(hold.holdId);
      setHold(null);
    },
    /** Forgets the hold locally (it expired, or it became an order). */
    clear: () => setHold(null),
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { seatMapKey, seatMapQuery, seatStreamUrl } from '../api';

/**
 * Seat availability kept fresh by Server-Sent Events. The stream only says
 * "something changed"; the data always comes from the query, so a dropped
 * message or a reconnect can never leave the map in a wrong state.
 */
export function useSeatMap(eventId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(seatMapQuery(eventId));
  const [live, setLive] = useState(false);

  useEffect(() => {
    const source = new EventSource(seatStreamUrl(eventId));
    const refresh = () => void queryClient.invalidateQueries({ queryKey: seatMapKey(eventId) });

    source.addEventListener('seats-changed', refresh);
    source.addEventListener('open', () => {
      setLive(true);
      refresh(); // catch up on anything missed while disconnected
    });
    source.addEventListener('error', () => setLive(false)); // EventSource reconnects by itself

    return () => {
      source.close();
      setLive(false);
    };
  }, [eventId, queryClient]);

  return { ...query, live };
}

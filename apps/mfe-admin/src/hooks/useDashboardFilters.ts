import { dashboardPeriodSchema, type DashboardPeriod } from '@plateia/contracts';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DashboardFilters } from '../api';

/**
 * Filters live in the URL (?event=…&period=…): a filtered view can be
 * bookmarked or shared, and the browser back button undoes a filter change.
 */
export function useDashboardFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<DashboardFilters>(() => {
    const period = dashboardPeriodSchema.safeParse(params.get('period'));
    return { eventId: params.get('event') || null, period: period.success ? period.data : '30d' };
  }, [params]);

  const update = useCallback(
    (next: Partial<{ eventId: string | null; period: DashboardPeriod }>) => {
      setParams((current) => {
        const merged = new URLSearchParams(current);
        if ('eventId' in next) {
          if (next.eventId) merged.set('event', next.eventId);
          else merged.delete('event');
        }
        if (next.period) merged.set('period', next.period);
        return merged;
      });
    },
    [setParams],
  );

  return { filters, update };
}

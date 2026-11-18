import type { Dashboard, DashboardPeriod, LoginRequest, Organizer } from '@plateia/contracts';
import { apiConfig, apiRequest } from '@plateia/web-kit';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';

const { backofficeUrl } = apiConfig;
// The session is an httpOnly cookie: the browser sends it, JavaScript never sees it.
const withSession = { credentials: 'include' } as const;

export const meKey = ['admin', 'me'] as const;

export const meQuery = queryOptions({
  queryKey: meKey,
  queryFn: ({ signal }) => apiRequest<Organizer>(`${backofficeUrl}/auth/me`, { ...withSession, signal }),
  staleTime: 5 * 60_000,
});

export interface DashboardFilters {
  eventId: string | null;
  period: DashboardPeriod;
}

export const dashboardQuery = (filters: DashboardFilters) =>
  queryOptions({
    queryKey: ['admin', 'dashboard', filters.eventId, filters.period],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ period: filters.period });
      if (filters.eventId) params.set('eventId', filters.eventId);
      return apiRequest<Dashboard>(`${backofficeUrl}/dashboard?${params}`, { ...withSession, signal });
    },
    // Sales keep coming in: refresh in the background.
    refetchInterval: 30_000,
    // Changing a filter keeps the current charts until the new data arrives.
    placeholderData: keepPreviousData,
  });

export const login = (request: LoginRequest) =>
  apiRequest<Organizer>(`${backofficeUrl}/auth/login`, { ...withSession, method: 'POST', body: request });

export const logout = () => apiRequest<void>(`${backofficeUrl}/auth/logout`, { ...withSession, method: 'POST' });

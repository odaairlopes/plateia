import {
  Alert,
  AlertTitle,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  SvgIcon,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { dashboardPeriodSchema, type DashboardPeriod, type Organizer } from '@plateia/contracts';
import { usePageTitle } from '@plateia/web-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { dashboardQuery, logout, meKey } from '../api';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { useFormatters } from '../hooks/useFormatters';
import { NAMESPACE } from '../i18n';
import { KpiCard } from './Cards';
import { DashboardCharts } from './DashboardCharts';

const kpiGrid = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
};

export function DashboardView({ organizer }: { organizer: Organizer }) {
  const { t } = useTranslation(NAMESPACE);
  const format = useFormatters();
  const queryClient = useQueryClient();
  const { filters, update } = useDashboardFilters();
  const dashboard = useQuery(dashboardQuery(filters));
  usePageTitle(t('pageTitle'));

  const signOut = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      // Reset (not just remove) "who is signed in": the mounted AdminApp observer
      // re-renders, asks the API again, gets a 401 and shows the login. Removing
      // it would leave that observer holding the old organizer, and this view
      // on screen refetching the dashboard into an error.
      await queryClient.resetQueries({ queryKey: meKey });
      // Then drop the sales data, so nothing is left in memory after signing out.
      queryClient.removeQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });

  const data = dashboard.data;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 2 }}
      >
        <Stack spacing={0.5}>
          <Typography variant="overline" color="primary">
            {organizer.name}
          </Typography>
          <Typography variant="h1" sx={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)' }}>
            {t('pageTitle')}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {data ? (
            <Typography variant="body2" color="text.secondary" aria-live="polite">
              {t('header.updatedAt', { time: format.time(new Date(dashboard.dataUpdatedAt).toISOString()) })}
            </Typography>
          ) : null}
          <Tooltip title={t('header.refresh')}>
            <IconButton aria-label={t('header.refresh')} onClick={() => void dashboard.refetch()}>
              <SvgIcon fontSize="small" aria-hidden>
                <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" />
              </SvgIcon>
            </IconButton>
          </Tooltip>
          <Button variant="outlined" onClick={() => signOut.mutate()} loading={signOut.isPending}>
            {t('header.logout')}
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2, alignItems: { md: 'center' } }}>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          {/* "All events" is an empty value, so the label must stay shrunk above it. */}
          <InputLabel id="event-filter-label" shrink>
            {t('filters.event')}
          </InputLabel>
          <Select
            labelId="event-filter-label"
            label={t('filters.event')}
            value={filters.eventId ?? ''}
            displayEmpty
            notched
            onChange={(event) => update({ eventId: event.target.value || null })}
            renderValue={(value) =>
              value ? (data?.events.find((show) => show.id === value)?.title ?? value) : t('filters.allEvents')
            }
          >
            <MenuItem value="">{t('filters.allEvents')}</MenuItem>
            {(data?.events ?? []).map((show) => (
              <MenuItem key={show.id} value={show.id}>
                {show.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filters.period}
          aria-label={t('filters.period')}
          onChange={(_event, next: DashboardPeriod | null) => {
            if (next) update({ period: next });
          }}
        >
          {dashboardPeriodSchema.options.map((period) => (
            <ToggleButton key={period} value={period} sx={{ px: 1.75 }}>
              {t(`filters.periods.${period}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {/* Thin bar while a filter change or background refresh is in flight. */}
      <Box sx={{ height: 4, mt: '-12px !important' }}>
        {dashboard.isFetching && data ? <LinearProgress aria-label={t('loading')} /> : null}
      </Box>

      {dashboard.isError && !data ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void dashboard.refetch()}>
              {t('error.retry')}
            </Button>
          }
        >
          <AlertTitle sx={{ mb: 0 }}>{t('error.title')}</AlertTitle>
        </Alert>
      ) : !data ? (
        <Stack spacing={2} role="status" aria-label={t('loading')}>
          <Box sx={kpiGrid}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={118} />
            ))}
          </Box>
          <Skeleton variant="rounded" height={380} />
        </Stack>
      ) : (
        <>
          <Box component="section" aria-label={t('pageTitle')} sx={kpiGrid}>
            <KpiCard label={t('kpi.revenue')} value={format.money(data.kpis.revenueCents)} />
            <KpiCard label={t('kpi.tickets')} value={format.number(data.kpis.ticketsSold)} />
            <KpiCard label={t('kpi.orders')} value={format.number(data.kpis.ordersConfirmed)} />
            <KpiCard label={t('kpi.averageTicket')} value={format.money(data.kpis.averageTicketCents)} />
            <KpiCard
              label={t('kpi.occupancy')}
              value={format.percent(data.kpis.occupancy)}
              progress={data.kpis.occupancy}
              hint={t('kpi.occupancyHint', {
                sold: format.number(Math.round(data.kpis.occupancy * data.kpis.capacity)),
                capacity: format.number(data.kpis.capacity),
              })}
            />
            <KpiCard
              label={t('kpi.conversion')}
              value={format.percent(data.kpis.conversionRate)}
              hint={t('kpi.conversionHint', { cancelled: format.number(data.kpis.cancelledOrders) })}
            />
          </Box>
          <DashboardCharts data={data} />
        </>
      )}
    </Stack>
  );
}

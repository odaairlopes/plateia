import { Box, Typography } from '@mui/material';
import type { Dashboard } from '@plateia/contracts';
import { useLocale } from '@plateia/web-kit';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../charts/EChart';
import {
  heatmapOption,
  occupancyOption,
  outcomesOption,
  revenueByEventOption,
  salesOverTimeOption,
  type Labels,
} from '../charts/options';
import { useChartTheme } from '../hooks/useChartTheme';
import { useFormatters } from '../hooks/useFormatters';
import { NAMESPACE } from '../i18n';
import { ChartCard } from './Cards';
import { RecentOrders } from './RecentOrders';

const twoColumns = { display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.4fr) minmax(0, 1fr)' } };

export function DashboardCharts({ data }: { data: Dashboard }) {
  const { t } = useTranslation(NAMESPACE);
  const { localized } = useLocale();
  const theme = useChartTheme();
  const format = useFormatters();
  const singleEvent = data.scope.eventId !== null;

  const labels = useMemo<Labels>(
    () => ({
      revenue: t('charts.revenue'),
      tickets: t('charts.tickets'),
      sold: t('charts.sold'),
      available: t('charts.available'),
      orders: t('charts.orders'),
      conversion: t('charts.conversion'),
      outcomes: {
        confirmed: t('outcomes.confirmed'),
        payment_declined: t('outcomes.payment_declined'),
        expired: t('outcomes.expired'),
        seat_conflict: t('outcomes.seat_conflict'),
      },
      weekdays: t('weekdays', { returnObjects: true }) as string[],
    }),
    [t],
  );

  // A single event is broken down by section; all events, by event.
  const occupancyRows = useMemo(
    () =>
      singleEvent
        ? data.bySection.map((section) => ({ label: localized(section.name), sold: section.soldToDate, capacity: section.capacity }))
        : data.byEvent.map((event) => ({ label: event.title, sold: event.soldToDate, capacity: event.capacity })),
    [data, singleEvent, localized],
  );

  const options = useMemo(
    () => ({
      sales: salesOverTimeOption(data.salesByDay, theme, format, labels),
      revenue: revenueByEventOption(data.byEvent, theme, format, labels),
      occupancy: occupancyOption(occupancyRows, theme, format, labels),
      outcomes: outcomesOption(data.outcomes, data.kpis.conversionRate, theme, format, labels),
      heatmap: heatmapOption(data.heatmap, theme, format, labels),
    }),
    [data, occupancyRows, theme, format, labels],
  );

  const occupancyChart = (
    <ChartCard title={singleEvent ? t('charts.occupancyBySection') : t('charts.occupancyByEvent')}>
      <EChart
        option={options.occupancy}
        height={Math.max(180, occupancyRows.length * 44 + 40)}
        summary={t('charts.summary.occupancy', { percent: format.percent(data.kpis.occupancy) })}
      />
    </ChartCard>
  );

  const outcomesChart = (
    <ChartCard title={t('charts.outcomes')}>
      <EChart
        option={options.outcomes}
        height={300}
        summary={t('charts.summary.outcomes', {
          confirmed: data.outcomes.confirmed,
          cancelled: data.kpis.cancelledOrders,
        })}
      />
    </ChartCard>
  );

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <ChartCard title={t('charts.salesOverTime')} hint={t('charts.salesOverTimeHint')}>
        {data.kpis.ordersConfirmed === 0 ? (
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {t('charts.noSales')}
          </Typography>
        ) : null}
        <EChart
          option={options.sales}
          height={320}
          summary={t('charts.summary.salesOverTime', {
            revenue: format.money(data.kpis.revenueCents),
            tickets: format.number(data.kpis.ticketsSold),
          })}
        />
      </ChartCard>

      {singleEvent ? (
        <Box sx={twoColumns}>
          {occupancyChart}
          {outcomesChart}
        </Box>
      ) : (
        <>
          <Box sx={twoColumns}>
            <ChartCard title={t('charts.revenueByEvent')}>
              <EChart
                option={options.revenue}
                height={Math.max(220, data.byEvent.length * 48 + 24)}
                summary={t('charts.summary.revenueByEvent', { top: data.byEvent[0]?.title ?? '—' })}
              />
            </ChartCard>
            {outcomesChart}
          </Box>
          {occupancyChart}
        </>
      )}

      <ChartCard title={t('charts.heatmap')} hint={t('charts.heatmapHint')}>
        <EChart option={options.heatmap} height={300} summary={t('charts.summary.heatmap')} />
      </ChartCard>

      <ChartCard title={t('recent.title')}>
        <RecentOrders orders={data.recentOrders} showEvent={!singleEvent} />
      </ChartCard>
    </Box>
  );
}

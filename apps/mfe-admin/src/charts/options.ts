import type { Dashboard } from '@plateia/contracts';
import type { ChartTheme } from '../hooks/useChartTheme';
import type { ChartOption } from './echarts';

/**
 * One pure function per chart: data + theme + formatters in, ECharts option
 * out. No React, no fetching, so each chart is easy to read and to change.
 */

export interface Formatters {
  money: (cents: number) => string;
  moneyCompact: (cents: number) => string;
  number: (value: number) => string;
  percent: (ratio: number) => string;
  shortDate: (isoDate: string) => string;
  longDate: (isoDate: string) => string;
}

export interface Labels {
  revenue: string;
  tickets: string;
  sold: string;
  available: string;
  orders: string;
  conversion: string;
  outcomes: Record<keyof Dashboard['outcomes'], string>;
  weekdays: string[];
}

/** Settings shared by every chart: fonts, colors, tooltip look, accessibility. */
function base(theme: ChartTheme): ChartOption {
  return {
    animation: theme.animate,
    textStyle: { fontFamily: theme.fontFamily, color: theme.text },
    aria: { enabled: true },
    tooltip: {
      backgroundColor: theme.surface,
      borderColor: theme.gridLine,
      textStyle: { color: theme.text, fontFamily: theme.fontFamily },
      confine: true,
    },
  };
}

const axisCommon = (theme: ChartTheme) => ({
  axisLine: { lineStyle: { color: theme.gridLine } },
  axisLabel: { color: theme.mutedText },
  splitLine: { lineStyle: { color: theme.gridLine, type: 'dashed' as const } },
});

export function salesOverTimeOption(
  days: Dashboard['salesByDay'],
  theme: ChartTheme,
  format: Formatters,
  labels: Labels,
): ChartOption {
  const zoomable = days.length > 31;
  return {
    ...base(theme),
    grid: { left: 8, right: 8, top: 40, bottom: zoomable ? 56 : 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: theme.mutedText } },
    tooltip: {
      ...base(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const points = params as Array<{ dataIndex: number }>;
        const day = days[points[0]?.dataIndex ?? 0];
        if (!day) return '';
        return `<strong>${format.longDate(day.date)}</strong><br/>${labels.revenue}: ${format.money(day.revenueCents)}<br/>${labels.tickets}: ${format.number(day.tickets)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: days.map((day) => format.shortDate(day.date)),
      ...axisCommon(theme),
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        ...axisCommon(theme),
        axisLabel: { color: theme.mutedText, formatter: (value: number) => format.moneyCompact(value) },
      },
      { type: 'value', ...axisCommon(theme), splitLine: { show: false }, minInterval: 1 },
    ],
    dataZoom: zoomable
      ? [
          { type: 'inside', start: 60, end: 100 },
          { type: 'slider', start: 60, end: 100, height: 22, bottom: 8, borderColor: theme.gridLine },
        ]
      : [],
    series: [
      {
        name: labels.revenue,
        type: 'bar',
        data: days.map((day) => day.revenueCents),
        itemStyle: { color: theme.primary, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
      {
        name: labels.tickets,
        type: 'line',
        yAxisIndex: 1,
        data: days.map((day) => day.tickets),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: theme.secondary },
        lineStyle: { width: 2.5 },
      },
    ],
  };
}

export function revenueByEventOption(
  events: Dashboard['byEvent'],
  theme: ChartTheme,
  format: Formatters,
  labels: Labels,
): ChartOption {
  // Highest revenue on top: ECharts draws the category axis bottom-up.
  const rows = [...events].reverse();
  return {
    ...base(theme),
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...base(theme).tooltip,
      trigger: 'item',
      formatter: (params: unknown) => {
        const row = rows[(params as { dataIndex: number }).dataIndex];
        return row
          ? `<strong>${row.title}</strong><br/>${labels.revenue}: ${format.money(row.revenueCents)}<br/>${labels.tickets}: ${format.number(row.tickets)}`
          : '';
      },
    },
    xAxis: { type: 'value', ...axisCommon(theme), axisLabel: { color: theme.mutedText, formatter: (v: number) => format.moneyCompact(v) } },
    yAxis: {
      type: 'category',
      data: rows.map((row) => row.title),
      ...axisCommon(theme),
      axisTick: { show: false },
      axisLabel: { color: theme.text, width: 170, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        name: labels.revenue,
        data: rows.map((row, index) => ({
          value: row.revenueCents,
          itemStyle: { color: theme.series[(rows.length - 1 - index) % theme.series.length] },
        })),
        barMaxWidth: 26,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: theme.mutedText,
          formatter: (params: { value: unknown }) => format.moneyCompact(Number(params.value)),
        },
      },
    ],
  };
}

export interface OccupancyRow {
  label: string;
  sold: number;
  capacity: number;
}

/** Sold vs. still available, stacked to the capacity, with the percentage at the end of each bar. */
export function occupancyOption(rows: OccupancyRow[], theme: ChartTheme, format: Formatters, labels: Labels): ChartOption {
  const ordered = [...rows].reverse();
  return {
    ...base(theme),
    grid: { left: 8, right: 56, top: 32, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: theme.mutedText } },
    tooltip: {
      ...base(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const row = ordered[(params as Array<{ dataIndex: number }>)[0]?.dataIndex ?? 0];
        return row
          ? `<strong>${row.label}</strong><br/>${labels.sold}: ${format.number(row.sold)} / ${format.number(row.capacity)} (${format.percent(row.capacity ? row.sold / row.capacity : 0)})`
          : '';
      },
    },
    xAxis: { type: 'value', show: false, max: (value: { max: number }) => value.max },
    yAxis: {
      type: 'category',
      data: ordered.map((row) => row.label),
      ...axisCommon(theme),
      axisTick: { show: false },
      axisLabel: { color: theme.text, width: 190, overflow: 'truncate' },
    },
    series: [
      {
        name: labels.sold,
        type: 'bar',
        stack: 'seats',
        data: ordered.map((row) => row.sold),
        itemStyle: { color: theme.primary },
        barMaxWidth: 22,
      },
      {
        name: labels.available,
        type: 'bar',
        stack: 'seats',
        data: ordered.map((row) => row.capacity - row.sold),
        itemStyle: { color: theme.gridLine, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: theme.text,
          fontWeight: 600,
          formatter: (params: { dataIndex: number }) => {
            const row = ordered[params.dataIndex];
            return row && row.capacity ? format.percent(row.sold / row.capacity) : '';
          },
        },
      },
    ],
  };
}

export function outcomesOption(
  outcomes: Dashboard['outcomes'],
  conversionRate: number,
  theme: ChartTheme,
  format: Formatters,
  labels: Labels,
): ChartOption {
  const keys = ['confirmed', 'payment_declined', 'expired', 'seat_conflict'] as const;
  return {
    ...base(theme),
    tooltip: {
      ...base(theme).tooltip,
      trigger: 'item',
      formatter: (params: unknown) => {
        const { name, value, percent } = params as { name: string; value: number; percent: number };
        return `<strong>${name}</strong><br/>${format.number(value)} ${labels.orders.toLowerCase()} (${percent}%)`;
      },
    },
    legend: { bottom: 0, left: 'center', textStyle: { color: theme.mutedText }, itemGap: 14 },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: theme.surface, borderWidth: 3, borderRadius: 6 },
        label: {
          show: true,
          position: 'center',
          formatter: `{value|${format.percent(conversionRate)}}\n{caption|${labels.conversion}}`,
          rich: {
            value: { fontSize: 26, fontWeight: 700, color: theme.text, lineHeight: 34 },
            caption: { fontSize: 12, color: theme.mutedText },
          },
        },
        emphasis: { label: { show: true } },
        labelLine: { show: false },
        data: keys.map((key) => ({ name: labels.outcomes[key], value: outcomes[key], itemStyle: { color: theme.outcome[key] } })),
      },
    ],
  };
}

export function heatmapOption(
  cells: Dashboard['heatmap'],
  theme: ChartTheme,
  format: Formatters,
  labels: Labels,
): ChartOption {
  const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}h`);
  const max = Math.max(1, ...cells.map((cell) => cell.orders));
  return {
    ...base(theme),
    grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
    tooltip: {
      ...base(theme).tooltip,
      position: 'top',
      formatter: (params: unknown) => {
        const [hour, weekday, orders] = (params as { value: [number, number, number] }).value;
        return `<strong>${labels.weekdays[weekday]} · ${hours[hour]}</strong><br/>${format.number(orders)} ${labels.orders.toLowerCase()}`;
      },
    },
    xAxis: { type: 'category', data: hours, ...axisCommon(theme), splitArea: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: 'category',
      data: labels.weekdays,
      ...axisCommon(theme),
      axisTick: { show: false },
      axisLabel: { color: theme.text },
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 140,
      itemWidth: 12,
      textStyle: { color: theme.mutedText },
      inRange: { color: theme.heat },
    },
    series: [
      {
        type: 'heatmap',
        data: cells.map((cell) => [cell.hour, cell.weekday, cell.orders]),
        itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: theme.text, borderWidth: 1 } },
      },
    ],
  };
}

import { Box } from '@mui/material';
import { useEffect, useRef } from 'react';
import { echarts, type ChartOption } from './echarts';

interface EChartProps {
  option: ChartOption;
  height: number;
  /** Text alternative read by screen readers instead of the drawing. */
  summary: string;
}

/**
 * Thin React wrapper: creates the chart once, feeds it new options, follows
 * the container size and disposes it on unmount (no leaked listeners).
 */
export function EChart({ option, height, summary }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // notMerge: a filter change can remove series; merging would leave stale ones.
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <Box ref={containerRef} role="img" aria-label={summary} sx={{ width: '100%', height }} />;
}

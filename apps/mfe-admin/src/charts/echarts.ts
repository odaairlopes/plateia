import type { BarSeriesOption, HeatmapSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import type {
  AriaComponentOption,
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

/**
 * Only what the dashboard uses is registered (tree-shaking keeps the rest of
 * ECharts out of the bundle). SVG renderer: sharp at any zoom level, smaller
 * memory footprint than canvas for a handful of charts, and printable.
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  AriaComponent,
  SVGRenderer,
]);

/** Option type restricted to the registered pieces: using anything else is a type error. */
export type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | HeatmapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | VisualMapComponentOption
  | AriaComponentOption
>;

export { echarts };

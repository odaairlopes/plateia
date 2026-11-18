import { useColorScheme, useMediaQuery, useTheme, type Theme } from '@mui/material';
import { useMemo } from 'react';

type ThemeWithSchemes = Theme & {
  colorSchemes?: Partial<Record<'light' | 'dark', { palette: Theme['palette'] }>>;
};

export interface ChartTheme {
  text: string;
  mutedText: string;
  gridLine: string;
  surface: string;
  primary: string;
  secondary: string;
  /** Categorical palette for series that are not semantically colored. */
  series: string[];
  outcome: { confirmed: string; payment_declined: string; expired: string; seat_conflict: string };
  /** Low → high for the heatmap. */
  heat: [string, string, string];
  fontFamily: string;
  animate: boolean;
}

// Checked for contrast against each background; both schemes keep the brand hues.
const SERIES = {
  light: ['#5B2BE0', '#B45309', '#0E7490', '#BE185D', '#4D7C0F', '#7C3AED'],
  dark: ['#B9A5FF', '#FBBF24', '#5EEAD4', '#F9A8D4', '#BEF264', '#C4B5FD'],
};

/**
 * ECharts draws outside React and MUI, so it cannot read CSS variables: the
 * resolved colors of the active scheme (light or dark) are passed in instead,
 * and every chart re-renders when the user flips the theme.
 */
export function useChartTheme(): ChartTheme {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const scheme = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light';
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return useMemo(() => {
    // With CSS variables enabled, MUI keeps each scheme's palette under `colorSchemes`.
    const palette = (theme as ThemeWithSchemes).colorSchemes?.[scheme]?.palette ?? theme.palette;
    const dark = scheme === 'dark';
    return {
      text: palette.text.primary,
      mutedText: palette.text.secondary,
      gridLine: palette.divider,
      surface: palette.background.paper,
      primary: palette.primary.main,
      secondary: palette.secondary.main,
      series: SERIES[scheme],
      outcome: dark
        ? { confirmed: '#4ADE80', payment_declined: '#F87171', expired: '#94A3B8', seat_conflict: '#FBBF24' }
        : { confirmed: '#15803D', payment_declined: '#DC2626', expired: '#64748B', seat_conflict: '#D97706' },
      heat: dark ? ['#1E1A33', '#6D4FD6', '#D9CCFF'] : ['#F1EEF9', '#9A7BF0', '#3F1BA8'],
      fontFamily: String(theme.typography.fontFamily),
      animate: !reduceMotion,
    };
  }, [scheme, reduceMotion, theme]);
}

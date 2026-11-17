import { createTheme } from '@mui/material';

const fontFamily = '"Outfit Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Design tokens for the whole product. Light and dark are two color schemes of
 * the same theme (CSS variables), so switching does not re-render the tree and
 * there is no flash on load. Text/background pairs meet WCAG AA contrast.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#5B2BE0', contrastText: '#FFFFFF' },
        secondary: { main: '#B45309', contrastText: '#FFFFFF' },
        background: { default: '#F6F4FB', paper: '#FFFFFF' },
        text: { primary: '#17132A', secondary: '#565170' },
        divider: 'rgba(23, 19, 42, 0.12)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#B9A5FF', contrastText: '#15102B' },
        secondary: { main: '#FBBF24', contrastText: '#15102B' },
        background: { default: '#0D0A18', paper: '#171329' },
        text: { primary: '#F2EFFA', secondary: '#B3ADC9' },
        divider: 'rgba(242, 239, 250, 0.14)',
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily,
    h1: { fontSize: 'clamp(2rem, 4.5vw, 3.25rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 },
    h2: { fontSize: 'clamp(1.4rem, 2.6vw, 1.85rem)', fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h3: { fontSize: '1.15rem', fontWeight: 650, letterSpacing: '-0.01em', lineHeight: 1.3 },
    overline: { fontWeight: 650, letterSpacing: '0.14em', fontSize: '0.72rem' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 999, paddingInline: 20 }, sizeLarge: { paddingBlock: 12 } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 550 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});

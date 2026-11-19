import {
  AppBar,
  Box,
  Container,
  IconButton,
  Link,
  SvgIcon,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
} from '@mui/material';
import { changeLanguage, LANGUAGES, useLocale, type Language } from '@plateia/web-kit';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

function Logo() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <SvgIcon viewBox="0 0 32 32" sx={{ fontSize: 30 }} aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--mui-palette-primary-main)" />
        <path
          d="M7 21a9 9 0 0 1 18 0"
          fill="none"
          stroke="var(--mui-palette-primary-contrastText)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path d="M11.5 21a4.5 4.5 0 0 1 9 0" fill="none" stroke="#FBBF24" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16" cy="9" r="2.2" fill="var(--mui-palette-primary-contrastText)" />
      </SvgIcon>
      <Typography component="span" sx={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
        plateia
      </Typography>
    </Box>
  );
}

function LanguageSwitch() {
  const { t } = useTranslation('shell');
  const { language } = useLocale();

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={language}
      aria-label={t('language')}
      onChange={(_event, next: Language | null) => {
        if (next) changeLanguage(next);
      }}
    >
      {LANGUAGES.map((code) => (
        <ToggleButton key={code} value={code} aria-label={t(`languageNames.${code}`)} sx={{ px: 1.25, py: 0.4 }}>
          {code.toUpperCase()}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function ColorModeToggle() {
  const { t } = useTranslation('shell');
  const { mode, systemMode, setMode } = useColorScheme();
  const isDark = (mode === 'system' ? systemMode : mode) === 'dark';
  const label = isDark ? t('theme.toLight') : t('theme.toDark');

  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={() => setMode(isDark ? 'light' : 'dark')}>
        <SvgIcon fontSize="small" aria-hidden>
          {isDark ? (
            <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4 11a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1Zm17 0a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM6.3 4.9l.7.7A1 1 0 0 1 5.6 7l-.7-.7a1 1 0 0 1 1.4-1.4Zm12.1 12.1.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4ZM7 18.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7A1 1 0 0 1 7 18.4ZM19.1 6.3l-.7.7A1 1 0 0 1 17 5.6l.7-.7a1 1 0 0 1 1.4 1.4Z" />
          ) : (
            <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a.75.75 0 0 0-.95-.93A9.75 9.75 0 1 0 21.33 15.15a.75.75 0 0 0-.93-.95Z" />
          )}
        </SvgIcon>
      </IconButton>
    </Tooltip>
  );
}

export function Layout() {
  const { t } = useTranslation('shell');
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // A client-side navigation does not move focus by itself; send it to the new
  // page so keyboard and screen-reader users are not left in the old context.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
    // Runs on every navigation by design: pathname is the trigger, not an input.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [pathname]);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Link
        href="#main"
        sx={{
          position: 'absolute',
          left: 16,
          top: -64,
          zIndex: 'tooltip',
          px: 2,
          py: 1,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:focus': { top: 12 },
        }}
      >
        {t('skipToContent')}
      </Link>

      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          backdropFilter: 'blur(14px)',
          backgroundColor: 'color-mix(in srgb, var(--mui-palette-background-default) 82%, transparent)',
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ gap: 1.5 }}>
            <Link
              component={RouterLink}
              to="/"
              underline="none"
              color="text.primary"
              aria-label={t('home')}
              sx={{ borderRadius: 2 }}
            >
              <Logo />
            </Link>
            <Box sx={{ flexGrow: 1 }} />
            <LanguageSwitch />
            <ColorModeToggle />
          </Toolbar>
        </Container>
      </AppBar>

      <Container
        component="main"
        id="main"
        ref={mainRef}
        tabIndex={-1}
        maxWidth="lg"
        sx={{ flexGrow: 1, py: { xs: 3, md: 5 }, outline: 'none' }}
      >
        <Outlet />
      </Container>

      <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', py: 3 }}>
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary">
            {t('footer')}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

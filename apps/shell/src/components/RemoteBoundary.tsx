import { Alert, AlertTitle, Box, Button, LinearProgress } from '@mui/material';
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/** Error boundaries are the one React feature that still requires a class. */
class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Hook for an error tracker (e.g. Sentry) once observability is added.
    console.error('Micro frontend failed', error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RemoteUnavailable() {
  const { t } = useTranslation('shell');
  return (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ my: 6 }}
      action={
        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
          {t('remote.retry')}
        </Button>
      }
    >
      <AlertTitle>{t('remote.unavailableTitle')}</AlertTitle>
      {t('remote.unavailableBody')}
    </Alert>
  );
}

function RemoteLoading() {
  const { t } = useTranslation('shell');
  return (
    <Box sx={{ py: 6 }} role="status" aria-label={t('remote.loading')}>
      <LinearProgress />
    </Box>
  );
}

/**
 * Isolates a micro frontend: if its bundle fails to load or it throws while
 * rendering, only this region shows an error and the shell keeps working.
 * Keyed by the path, so navigating away from a broken page recovers.
 */
export function RemoteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname} fallback={<RemoteUnavailable />}>
      <Suspense fallback={<RemoteLoading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

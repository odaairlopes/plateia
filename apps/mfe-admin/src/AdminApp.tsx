import './i18n';
import { Box, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { meQuery } from './api';
import { DashboardView } from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { NAMESPACE } from './i18n';

/**
 * The organizer back office, exposed to the shell as a single page.
 *
 * The UI only decides what to show; access control is enforced by the API
 * (every dashboard request needs a valid session cookie and is limited to
 * the organizer's own events). Hiding a screen is never security.
 */
export default function AdminApp() {
  const { t } = useTranslation(NAMESPACE);
  const me = useQuery(meQuery);

  if (me.isPending) {
    return (
      <Box sx={{ py: 6 }} role="status" aria-label={t('loading')}>
        <LinearProgress />
      </Box>
    );
  }

  if (me.data) return <DashboardView organizer={me.data} />;

  // Not signed in, or the session expired (401): sign in again.
  return <LoginView />;
}

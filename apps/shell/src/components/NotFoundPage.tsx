import { Button, Stack, Typography } from '@mui/material';
import { usePageTitle } from '@plateia/web-kit';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation('shell');
  usePageTitle(t('notFound.title'));

  return (
    <Stack spacing={2} sx={{ py: 10, alignItems: 'flex-start' }}>
      <Typography variant="overline" color="primary">
        404
      </Typography>
      <Typography variant="h1">{t('notFound.title')}</Typography>
      <Typography color="text.secondary">{t('notFound.body')}</Typography>
      <Button component={RouterLink} to="/" variant="contained" size="large">
        {t('notFound.back')}
      </Button>
    </Stack>
  );
}

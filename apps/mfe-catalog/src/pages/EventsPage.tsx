import '../i18n';
import { Alert, AlertTitle, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material';
import type { EventCategory } from '@plateia/contracts';
import { usePageTitle } from '@plateia/web-kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsQuery } from '../api';
import { EventCard } from '../components/EventCard';
import { NAMESPACE } from '../i18n';

type Filter = EventCategory | 'all';

const gridSx = {
  display: 'grid',
  gap: 2.5,
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 270px), 1fr))',
};

export default function EventsPage() {
  const { t } = useTranslation(NAMESPACE);
  const { data: events, isPending, isError, refetch } = useQuery(eventsQuery);
  const [filter, setFilter] = useState<Filter>('all');
  usePageTitle(undefined);

  const categories = useMemo<Filter[]>(
    () => ['all', ...new Set((events ?? []).map((event) => event.category))],
    [events],
  );
  const visible = useMemo(
    () => (events ?? []).filter((event) => filter === 'all' || event.category === filter),
    [events, filter],
  );

  return (
    <Stack spacing={{ xs: 3, md: 4 }}>
      <Stack spacing={1.5} sx={{ maxWidth: 720, pt: { xs: 1, md: 3 } }}>
        <Typography variant="overline" color="primary">
          {t('list.eyebrow')}
        </Typography>
        <Typography variant="h1">{t('list.title')}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: '1.1rem' }}>
          {t('list.subtitle')}
        </Typography>
      </Stack>

      {isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              {t('error.retry')}
            </Button>
          }
        >
          <AlertTitle sx={{ mb: 0 }}>{t('error.title')}</AlertTitle>
        </Alert>
      ) : isPending ? (
        <Box sx={gridSx} role="status" aria-label={t('loading')}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={330} />
          ))}
        </Box>
      ) : (
        <>
          <Stack
            direction="row"
            sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Stack direction="row" role="group" aria-label={t('list.filterLabel')} sx={{ gap: 1, flexWrap: 'wrap' }}>
              {categories.map((category) => {
                const selected = filter === category;
                return (
                  <Chip
                    key={category}
                    label={category === 'all' ? t('list.all') : t(`category.${category}`)}
                    color={selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    aria-pressed={selected}
                    onClick={() => setFilter(category)}
                  />
                );
              })}
            </Stack>
            <Typography variant="body2" color="text.secondary" aria-live="polite">
              {t('list.count', { count: visible.length })}
            </Typography>
          </Stack>

          {visible.length === 0 ? (
            <Typography color="text.secondary">{t('list.empty')}</Typography>
          ) : (
            <Box sx={gridSx}>
              {visible.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </Box>
          )}
        </>
      )}
    </Stack>
  );
}

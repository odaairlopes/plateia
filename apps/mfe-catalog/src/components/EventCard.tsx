import { Box, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material';
import type { EventSummary } from '@plateia/contracts';
import { formatDayAndMonth, formatEventDate, formatMoney, useLocale } from '@plateia/web-kit';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { NAMESPACE } from '../i18n';
import { EventPoster } from './EventPoster';

export function EventCard({ event }: { event: EventSummary }) {
  const { t } = useTranslation(NAMESPACE);
  const { locale } = useLocale();
  const { day, month } = formatDayAndMonth(event.startsAt, locale);

  return (
    <Card
      component="article"
      variant="outlined"
      sx={{
        height: '100%',
        transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
        '&:hover, &:focus-within': {
          transform: 'translateY(-3px)',
          borderColor: 'primary.main',
          boxShadow: '0 14px 34px -18px var(--mui-palette-primary-main)',
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover, &:focus-within': { transform: 'none' },
        },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={`/events/${event.id}`}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        <EventPoster hue={event.coverHue} sx={{ aspectRatio: '16 / 10' }}>
          <Stack sx={{ height: '100%', p: 2, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Chip
              size="small"
              label={t(`category.${event.category}`)}
              sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: '#fff', backdropFilter: 'blur(6px)' }}
            />
            <Box
              aria-hidden
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                bgcolor: 'rgba(10, 8, 20, 0.55)',
                backdropFilter: 'blur(6px)',
                textAlign: 'center',
                lineHeight: 1,
              }}
            >
              <Typography component="div" sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>
                {day}
              </Typography>
              <Typography component="div" variant="overline" sx={{ lineHeight: 1.4 }}>
                {month}
              </Typography>
            </Box>
          </Stack>
        </EventPoster>

        <Stack spacing={0.75} sx={{ p: 2.25, flexGrow: 1 }}>
          <Typography variant="h3" component="h2">
            {event.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, locale)}</time>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {event.venue} · {event.city}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ pt: 1 }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {t('card.from')}{' '}
            </Box>
            <Box component="strong" sx={{ fontSize: '1.05rem' }}>
              {formatMoney(event.minPriceCents, locale)}
            </Box>
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

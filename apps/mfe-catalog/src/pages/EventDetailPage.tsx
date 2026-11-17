import '../i18n';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatEventDate, formatMoney, isApiError, useLocale, usePageTitle } from '@plateia/web-kit';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { eventQuery } from '../api';
import { EventPoster } from '../components/EventPoster';
import { NAMESPACE } from '../i18n';

export default function EventDetailPage() {
  const { eventId = '' } = useParams();
  const { t } = useTranslation(NAMESPACE);
  const { locale, localized } = useLocale();
  const { data: event, isPending, error, refetch } = useQuery(eventQuery(eventId));
  usePageTitle(event?.title);

  const backLink = (
    <Link component={RouterLink} to="/" underline="hover" color="text.secondary" sx={{ alignSelf: 'flex-start' }}>
      ← {t('detail.back')}
    </Link>
  );

  if (isPending) {
    return (
      <Stack spacing={3} role="status" aria-label={t('loading')}>
        <Skeleton variant="rounded" height={300} />
        <Skeleton variant="rounded" height={180} />
      </Stack>
    );
  }

  if (error) {
    const notFound = isApiError(error, 'EVENT_NOT_FOUND');
    return (
      <Stack spacing={3}>
        {backLink}
        <Alert
          severity={notFound ? 'info' : 'error'}
          action={
            notFound ? undefined : (
              <Button color="inherit" size="small" onClick={() => void refetch()}>
                {t('error.retry')}
              </Button>
            )
          }
        >
          <AlertTitle>{notFound ? t('detail.notFoundTitle') : t('error.title')}</AlertTitle>
          {notFound ? t('detail.notFoundBody') : null}
        </Alert>
      </Stack>
    );
  }

  const seatsPath = `/events/${event.id}/seats`;

  return (
    <Stack spacing={{ xs: 3, md: 4 }}>
      {backLink}

      <EventPoster hue={event.coverHue} sx={{ borderRadius: 4 }}>
        <Stack spacing={2} sx={{ p: { xs: 3, md: 6 }, minHeight: { xs: 260, md: 340 }, justifyContent: 'flex-end' }}>
          <Chip
            size="small"
            label={t(`category.${event.category}`)}
            sx={{ alignSelf: 'flex-start', bgcolor: 'rgba(255,255,255,0.16)', color: '#fff' }}
          />
          <Typography variant="h1" sx={{ maxWidth: 760 }}>
            {event.title}
          </Typography>
          <Typography sx={{ opacity: 0.92, fontSize: '1.1rem' }}>
            <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, locale)}</time> · {event.venue},{' '}
            {event.city}
          </Typography>
        </Stack>
      </EventPoster>

      <Box sx={{ display: 'grid', gap: { xs: 3, md: 5 }, gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' } }}>
        <Stack spacing={4}>
          <Stack spacing={1.5} component="section" aria-labelledby="about-heading">
            <Typography variant="h2" id="about-heading">
              {t('detail.about')}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: '1.05rem', lineHeight: 1.7 }}>
              {localized(event.description)}
            </Typography>
          </Stack>

          <Stack spacing={1.5} component="section" aria-labelledby="sections-heading">
            <Typography variant="h2" id="sections-heading">
              {t('detail.sections')}
            </Typography>
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Table aria-labelledby="sections-heading">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('detail.sectionColumn')}</TableCell>
                    <TableCell align="right">{t('detail.seatsColumn')}</TableCell>
                    <TableCell align="right">{t('detail.priceColumn')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {event.sections.map((section) => (
                    <TableRow key={section.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        {localized(section.name)}
                      </TableCell>
                      <TableCell align="right">{section.rows * section.seatsPerRow}</TableCell>
                      <TableCell align="right">{formatMoney(section.priceCents, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Stack>
        </Stack>

        <Paper
          component="aside"
          variant="outlined"
          sx={{ p: 3, alignSelf: 'start', position: { md: 'sticky' }, top: { md: 88 } }}
        >
          <Stack spacing={2.5}>
            <Stack spacing={0.25}>
              <Typography variant="overline" color="text.secondary">
                {t('detail.when')}
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{formatEventDate(event.startsAt, locale)}</Typography>
            </Stack>
            <Stack spacing={0.25}>
              <Typography variant="overline" color="text.secondary">
                {t('detail.where')}
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{event.venue}</Typography>
              <Typography variant="body2" color="text.secondary">
                {event.city}
              </Typography>
            </Stack>
            <Stack spacing={0.25}>
              <Typography variant="overline" color="text.secondary">
                {t('detail.from')}
              </Typography>
              <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {formatMoney(event.minPriceCents, locale)}
              </Typography>
            </Stack>
            <Button component={RouterLink} to={seatsPath} variant="contained" size="large" fullWidth>
              {t('detail.chooseSeats')}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}

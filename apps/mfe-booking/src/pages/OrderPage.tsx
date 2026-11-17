import '../i18n';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import type { OrderDto, OrderStatus } from '@plateia/contracts';
import { formatEventDate, formatMoney, isApiError, useLocale, usePageTitle } from '@plateia/web-kit';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { eventQuery, orderQuery } from '../api';
import { useSeatName } from '../components/SeatList';
import { NAMESPACE } from '../i18n';

const POLL_MS = 1000;

/** Maps the saga state to the progress indicator: [active step, failed?]. */
const PROGRESS: Record<OrderStatus, { activeStep: number; failed: boolean }> = {
  pending_payment: { activeStep: 1, failed: false },
  confirmed: { activeStep: 3, failed: false },
  cancelled: { activeStep: 1, failed: true },
};

function OrderProgress({ status }: { status: OrderStatus }) {
  const { t } = useTranslation(NAMESPACE);
  const { activeStep, failed } = PROGRESS[status];
  const steps = [t('order.steps.created'), t('order.steps.payment'), t('order.steps.tickets')];

  return (
    <Stepper activeStep={activeStep} alternativeLabel>
      {steps.map((label, index) => (
        <Step key={label}>
          <StepLabel error={failed && index === activeStep}>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

function Ticket({ order }: { order: OrderDto }) {
  const { t } = useTranslation(NAMESPACE);
  const { locale } = useLocale();
  const event = useQuery(eventQuery(order.eventId));
  const seatName = useSeatName(event.data?.sections ?? []);

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 4 }}>
      <Box sx={{ p: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="overline" sx={{ opacity: 0.85 }}>
          {t('order.ticket')}
        </Typography>
        <Typography variant="h2" component="p">
          {event.data?.title ?? <Skeleton width={260} />}
        </Typography>
        {event.data ? (
          <Typography sx={{ opacity: 0.9 }}>
            <time dateTime={event.data.startsAt}>{formatEventDate(event.data.startsAt, locale)}</time> ·{' '}
            {event.data.venue}, {event.data.city}
          </Typography>
        ) : null}
      </Box>
      <Divider sx={{ borderStyle: 'dashed' }} />
      <Stack spacing={2.5} sx={{ p: 3 }}>
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            {t('order.seats')}
          </Typography>
          <Stack direction="row" component="ul" sx={{ gap: 1, flexWrap: 'wrap', listStyle: 'none', m: 0, p: 0 }}>
            {order.seatIds.map((seatId) => (
              <Chip key={seatId} component="li" label={seatName(seatId).name} />
            ))}
          </Stack>
        </Stack>
        <Stack direction="row" sx={{ gap: 4, flexWrap: 'wrap' }}>
          <Stack>
            <Typography variant="overline" color="text.secondary">
              {t('order.total')}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
              {formatMoney(order.totalCents, locale)}
            </Typography>
          </Stack>
          <Stack>
            <Typography variant="overline" color="text.secondary">
              {t('order.code')}
            </Typography>
            <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, fontSize: '1.1rem' }}>
              {order.id.slice(0, 8).toUpperCase()}
            </Typography>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function OrderPage() {
  const { orderId = '' } = useParams();
  const { t } = useTranslation(NAMESPACE);
  usePageTitle(t('order.title'));

  // The outcome arrives asynchronously through the saga, so poll until the
  // order reaches a final state and then stop.
  const { data: order, error, isPending } = useQuery({
    ...orderQuery(orderId),
    refetchInterval: (query) => (query.state.data?.status === 'pending_payment' ? POLL_MS : false),
  });

  if (isPending) {
    return (
      <Stack spacing={3} role="status" aria-label={t('order.loading')}>
        <Skeleton variant="rounded" height={90} />
        <Skeleton variant="rounded" height={260} />
      </Stack>
    );
  }

  if (error) {
    const notFound = isApiError(error, 'ORDER_NOT_FOUND') || isApiError(error, 'VALIDATION_ERROR');
    return (
      <Alert severity={notFound ? 'info' : 'error'} sx={{ my: 4 }}>
        <AlertTitle>{notFound ? t('order.notFound') : t('notice.error')}</AlertTitle>
        {notFound ? t('order.notFoundBody') : null}
      </Alert>
    );
  }

  return (
    <Stack spacing={4} sx={{ maxWidth: 720, mx: 'auto' }}>
      <OrderProgress status={order.status} />

      {/* One live region for the whole outcome, so the change of state is announced. */}
      <Stack spacing={3} aria-live="polite">
        {order.status === 'pending_payment' ? (
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }}>
            <CircularProgress aria-hidden />
            <Typography variant="h1" sx={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
              {t('order.pendingTitle')}
            </Typography>
            <Typography color="text.secondary">{t('order.pendingBody')}</Typography>
          </Stack>
        ) : null}

        {order.status === 'confirmed' ? (
          <>
            <Typography variant="h1" sx={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.4rem)' }}>
              {t('order.confirmedTitle', { name: order.customerName.split(' ')[0] })}
            </Typography>
            <Typography color="text.secondary">{t('order.emailSent')}</Typography>
            <Ticket order={order} />
            <Button component={RouterLink} to="/" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
              {t('order.backToEvents')}
            </Button>
          </>
        ) : null}

        {order.status === 'cancelled' ? (
          <>
            <Typography variant="h1" sx={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.4rem)' }}>
              {t('order.cancelledTitle')}
            </Typography>
            <Alert severity="warning">{t(`order.reason.${order.cancelReason ?? 'expired'}`)}</Alert>
            <Button
              component={RouterLink}
              to={`/events/${order.eventId}/seats`}
              variant="contained"
              size="large"
              sx={{ alignSelf: 'flex-start' }}
            >
              {t('order.tryAgain')}
            </Button>
          </>
        ) : null}
      </Stack>
    </Stack>
  );
}

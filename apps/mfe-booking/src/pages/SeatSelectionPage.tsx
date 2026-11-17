import '../i18n';
import { Alert, Box, Button, Chip, Divider, Link, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { MAX_SEATS_PER_HOLD, parseSeatId, type Section } from '@plateia/contracts';
import { formatEventDate, formatMoney, isApiError, useLocale, usePageTitle } from '@plateia/web-kit';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { createOrder, eventQuery } from '../api';
import { CheckoutForm, type CheckoutValues } from '../components/CheckoutForm';
import { HoldTimer } from '../components/HoldTimer';
import { SeatList } from '../components/SeatList';
import { SeatMap, type SeatStatus } from '../components/SeatMap';
import { useHold } from '../hooks/useHold';
import { useSeatMap } from '../hooks/useSeatMap';
import { NAMESPACE } from '../i18n';

type Notice = 'max' | 'conflict' | 'expired' | 'error' | 'closed';

const NOTICE_SEVERITY: Record<Notice, 'info' | 'warning' | 'error'> = {
  max: 'info',
  conflict: 'warning',
  expired: 'warning',
  error: 'error',
  closed: 'info',
};

function sumPrices(seatIds: string[], sections: Section[]): number {
  return seatIds.reduce((total, seatId) => {
    const sectionId = parseSeatId(seatId)?.sectionId;
    return total + (sections.find((section) => section.id === sectionId)?.priceCents ?? 0);
  }, 0);
}

function conflictingSeats(error: unknown): string[] {
  if (!isApiError(error, 'SEATS_UNAVAILABLE')) return [];
  const details = error.details as { seatIds?: unknown } | undefined;
  return Array.isArray(details?.seatIds) ? details.seatIds.filter((id): id is string => typeof id === 'string') : [];
}

export default function SeatSelectionPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(NAMESPACE);
  const { locale } = useLocale();

  const event = useQuery(eventQuery(eventId));
  const seatMap = useSeatMap(eventId);
  const { hold, reserve, isReserving, release, clear } = useHold(eventId);
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  usePageTitle(event.data ? `${t('title')} — ${event.data.title}` : t('title'));

  const mine = useMemo(() => new Set(hold?.seatIds), [hold]);
  const sold = useMemo(() => new Set(seatMap.data?.sold), [seatMap.data]);
  const held = useMemo(() => new Set(seatMap.data?.held), [seatMap.data]);

  // Derived, not stored: a picked seat that someone else takes simply drops out.
  const selection = useMemo(
    () => (hold ? hold.seatIds : picked.filter((seatId) => !sold.has(seatId) && !held.has(seatId))),
    [hold, picked, sold, held],
  );
  const selected = useMemo(() => new Set(selection), [selection]);

  const statusOf = useCallback(
    (seatId: string): SeatStatus => {
      if (mine.has(seatId)) return 'mine';
      if (sold.has(seatId)) return 'sold';
      if (held.has(seatId)) return 'held';
      return selected.has(seatId) ? 'selected' : 'available';
    },
    [mine, sold, held, selected],
  );

  const sections = event.data?.sections ?? [];
  const totalCents = hold ? hold.totalCents : sumPrices(selection, sections);
  const totalLabel = formatMoney(totalCents, locale);

  const toggleSeat = (seatId: string) => {
    if (selected.has(seatId)) {
      setPicked(selection.filter((id) => id !== seatId));
      setNotice(null);
    } else if (selection.length >= MAX_SEATS_PER_HOLD) {
      setNotice('max');
    } else {
      setPicked([...selection, seatId]);
      setNotice(null);
    }
  };

  const reserveSeats = async () => {
    try {
      await reserve(selection);
      setNotice(null);
    } catch (error) {
      const conflicts = conflictingSeats(error);
      if (conflicts.length > 0) {
        setPicked(selection.filter((seatId) => !conflicts.includes(seatId)));
        setNotice('conflict');
      } else {
        setNotice(isApiError(error, 'EVENT_ALREADY_STARTED') ? 'closed' : 'error');
      }
    }
  };

  const changeSeats = () => {
    if (hold) setPicked(hold.seatIds);
    release();
  };

  const expireHold = () => {
    clear();
    setPicked([]);
    setNotice('expired');
  };

  const checkout = useMutation({
    mutationFn: (values: CheckoutValues) =>
      createOrder({
        holdId: hold?.holdId ?? '',
        customer: { name: values.name, email: values.email },
        paymentScenario: values.paymentScenario,
      }),
    onSuccess: (order) => {
      clear(); // the hold now belongs to the order
      void navigate(`/orders/${order.id}`);
    },
    onError: (error) => {
      if (isApiError(error, 'HOLD_EXPIRED')) expireHold();
      else setNotice('error');
    },
  });

  const backLink = (
    <Link
      component={RouterLink}
      to={`/events/${eventId}`}
      underline="hover"
      color="text.secondary"
      sx={{ alignSelf: 'flex-start' }}
    >
      ← {t('back')}
    </Link>
  );

  if (event.isPending || seatMap.isPending) {
    return (
      <Stack spacing={3} role="status" aria-label={t('loading')}>
        <Skeleton variant="text" width={320} height={56} />
        <Skeleton variant="rounded" height={420} />
      </Stack>
    );
  }

  if (event.error || seatMap.error) {
    const notFound = isApiError(event.error, 'EVENT_NOT_FOUND');
    return (
      <Stack spacing={3}>
        {backLink}
        <Alert
          severity={notFound ? 'info' : 'error'}
          action={
            notFound ? undefined : (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  void event.refetch();
                  void seatMap.refetch();
                }}
              >
                {t('retry')}
              </Button>
            )
          }
        >
          {notFound ? t('eventNotFound') : t('loadError')}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {backLink}

      <Stack spacing={0.5}>
        <Typography variant="h1" sx={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }}>
          {t('title')}
        </Typography>
        <Typography color="text.secondary">
          {event.data.title} · <time dateTime={event.data.startsAt}>{formatEventDate(event.data.startsAt, locale)}</time>
        </Typography>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.7fr) minmax(300px, 1fr)' },
        }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, minWidth: 0 }}>
          <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 1 }}>
            <Chip
              size="small"
              variant="outlined"
              color={seatMap.live ? 'success' : 'default'}
              label={t('live')}
              icon={
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    ml: '8px !important',
                    borderRadius: '50%',
                    bgcolor: seatMap.live ? 'success.main' : 'text.disabled',
                  }}
                />
              }
            />
          </Stack>
          <SeatMap sections={sections} statusOf={statusOf} onToggle={toggleSeat} readOnly={Boolean(hold)} />
        </Paper>

        <Paper
          component="section"
          aria-labelledby="summary-heading"
          variant="outlined"
          sx={{ p: 3, position: { md: 'sticky' }, top: { md: 88 } }}
        >
          <Stack spacing={2.5}>
            <Typography variant="h2" id="summary-heading">
              {hold ? t('checkout.title') : t('summary.title')}
            </Typography>

            {/* Announced politely: these messages appear as a result of the visitor's own action. */}
            <Box aria-live="polite">
              {notice ? (
                <Alert severity={NOTICE_SEVERITY[notice]} onClose={() => setNotice(null)}>
                  {t(`notice.${notice}`, { max: MAX_SEATS_PER_HOLD })}
                </Alert>
              ) : null}
            </Box>

            {hold ? <HoldTimer key={hold.holdId} expiresAt={hold.expiresAt} onExpire={expireHold} /> : null}

            {selection.length === 0 ? (
              <Typography color="text.secondary">{t('summary.empty', { max: MAX_SEATS_PER_HOLD })}</Typography>
            ) : (
              <>
                <SeatList seatIds={selection} sections={sections} onRemove={hold ? undefined : toggleSeat} />
                <Divider />
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Typography color="text.secondary">
                    {t('summary.total')} · {t('summary.seats', { count: selection.length })}
                  </Typography>
                  <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {totalLabel}
                  </Typography>
                </Stack>
              </>
            )}

            {hold ? (
              <>
                <CheckoutForm
                  totalLabel={totalLabel}
                  submitting={checkout.isPending}
                  onSubmit={(values) => checkout.mutate(values)}
                />
                <Button variant="text" onClick={changeSeats} disabled={checkout.isPending}>
                  {t('summary.change')}
                </Button>
              </>
            ) : (
              <Button
                variant="contained"
                size="large"
                fullWidth
                disabled={selection.length === 0}
                loading={isReserving}
                onClick={() => void reserveSeats()}
              >
                {isReserving ? t('summary.reserving') : t('summary.reserve')}
              </Button>
            )}
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}

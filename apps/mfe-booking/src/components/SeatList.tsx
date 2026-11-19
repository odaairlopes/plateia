import { Box, IconButton, Stack, SvgIcon, Typography } from '@mui/material';
import { parseSeatId, rowLabel, type Section } from '@plateia/contracts';
import { formatMoney, useLocale } from '@plateia/web-kit';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from '../i18n';

interface SeatListProps {
  seatIds: string[];
  sections: Section[];
  /** When provided, each seat gets a remove button. */
  onRemove?: (seatId: string) => void;
}

/** Human-readable name of a seat, e.g. "Plateia · C12". */
export function useSeatName(sections: Section[]) {
  const { t } = useTranslation(NAMESPACE);
  const { localized } = useLocale();

  return (seatId: string): { name: string; priceCents: number } => {
    const seat = parseSeatId(seatId);
    const section = seat ? sections.find((candidate) => candidate.id === seat.sectionId) : undefined;
    if (!seat || !section) return { name: seatId, priceCents: 0 };
    return {
      name: t('seat.short', { section: localized(section.name), row: rowLabel(seat.row), number: seat.number }),
      priceCents: section.priceCents,
    };
  };
}

export function SeatList({ seatIds, sections, onRemove }: SeatListProps) {
  const { t } = useTranslation(NAMESPACE);
  const { locale } = useLocale();
  const seatName = useSeatName(sections);

  return (
    <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {seatIds.map((seatId) => {
        const { name, priceCents } = seatName(seatId);
        return (
          <Stack key={seatId} component="li" direction="row" sx={{ alignItems: 'center', gap: 1, minHeight: 36 }}>
            <Typography sx={{ flexGrow: 1, fontWeight: 550 }}>{name}</Typography>
            <Typography color="text.secondary">{formatMoney(priceCents, locale)}</Typography>
            {onRemove ? (
              <IconButton
                size="small"
                aria-label={t('summary.remove', { seat: name })}
                onClick={() => onRemove(seatId)}
              >
                <SvgIcon fontSize="inherit" aria-hidden>
                  <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z" />
                </SvgIcon>
              </IconButton>
            ) : (
              <Box sx={{ width: 0 }} />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

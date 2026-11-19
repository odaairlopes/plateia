import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { formatSeatId, rowLabel, type Section } from '@plateia/contracts';
import { formatMoney, useLocale } from '@plateia/web-kit';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from '../i18n';

export type SeatStatus = 'available' | 'selected' | 'mine' | 'held' | 'sold';

interface SeatMapProps {
  sections: Section[];
  statusOf: (seatId: string) => SeatStatus;
  onToggle: (seatId: string) => void;
  /** True while the visitor holds seats: the map becomes a read-only picture. */
  readOnly: boolean;
}

const SEAT_SIZE = 30;

/** Status is never conveyed by color alone: each state also has its own border, fill pattern or mark. */
const seatSx = {
  width: SEAT_SIZE,
  height: SEAT_SIZE,
  flex: 'none',
  p: 0,
  borderRadius: '9px 9px 6px 6px',
  border: '1.5px solid',
  borderColor: 'text.secondary',
  bgcolor: 'transparent',
  color: 'text.primary',
  font: 'inherit',
  fontSize: '0.7rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'transform 90ms ease, background-color 90ms ease',
  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  '&[data-status="selected"], &[data-status="mine"]': {
    bgcolor: 'primary.main',
    borderColor: 'primary.main',
    color: 'primary.contrastText',
    transform: 'scale(1.08)',
  },
  '&[data-status="held"]': {
    cursor: 'not-allowed',
    borderStyle: 'dashed',
    color: 'text.secondary',
    backgroundImage:
      'repeating-linear-gradient(135deg, transparent 0 4px, var(--mui-palette-action-disabledBackground) 4px 8px)',
  },
  '&[data-status="sold"]': {
    cursor: 'not-allowed',
    borderColor: 'transparent',
    bgcolor: 'action.disabledBackground',
    color: 'text.disabled',
    textDecoration: 'line-through',
  },
  '&[aria-disabled="true"]:hover': { borderColor: undefined },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
} as const;

function LegendItem({ status, label }: { status: SeatStatus; label: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box component="span" data-status={status} aria-hidden sx={{ ...seatSx, cursor: 'default', display: 'block' }} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

interface SectionGridProps extends Omit<SeatMapProps, 'sections'> {
  section: Section;
}

function SectionGrid({ section, statusOf, onToggle, readOnly }: SectionGridProps) {
  const { t } = useTranslation(NAMESPACE);
  const { localized } = useLocale();
  const gridRef = useRef<HTMLDivElement>(null);
  // Roving tabindex: the grid is a single Tab stop and the arrows move inside it,
  // so a keyboard user does not have to Tab through hundreds of seats.
  const [cursor, setCursor] = useState({ row: 1, number: 1 });

  const moveTo = (row: number, number: number) => {
    const next = {
      row: Math.min(Math.max(row, 1), section.rows),
      number: Math.min(Math.max(number, 1), section.seatsPerRow),
    };
    setCursor(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-seat="${next.row}:${next.number}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [row: number, number: number]> = {
      ArrowLeft: [cursor.row, cursor.number - 1],
      ArrowRight: [cursor.row, cursor.number + 1],
      ArrowUp: [cursor.row - 1, cursor.number],
      ArrowDown: [cursor.row + 1, cursor.number],
      Home: [cursor.row, 1],
      End: [cursor.row, section.seatsPerRow],
    };
    const target = moves[event.key];
    if (!target) return;
    event.preventDefault();
    moveTo(...target);
  };

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Stack
        ref={gridRef}
        role="group"
        aria-label={t('gridLabel', { section: localized(section.name) })}
        onKeyDown={onKeyDown}
        spacing={0.75}
        sx={{ width: 'max-content', mx: 'auto', px: 0.5, py: 1 }}
      >
        {Array.from({ length: section.rows }, (_, rowIndex) => {
          const row = rowIndex + 1;
          return (
            <Stack key={row} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Typography
                aria-hidden
                variant="caption"
                color="text.secondary"
                sx={{ width: 18, textAlign: 'center', fontWeight: 700 }}
              >
                {rowLabel(row)}
              </Typography>
              {Array.from({ length: section.seatsPerRow }, (_seat, seatIndex) => {
                const number = seatIndex + 1;
                const seatId = formatSeatId({ sectionId: section.id, row, number });
                const status = statusOf(seatId);
                const unavailable = status === 'held' || status === 'sold' || readOnly;
                const isCursor = cursor.row === row && cursor.number === number;
                return (
                  <Box
                    key={seatId}
                    component="button"
                    type="button"
                    data-seat={`${row}:${number}`}
                    data-status={status}
                    tabIndex={isCursor ? 0 : -1}
                    // aria-disabled keeps unavailable seats focusable, so screen-reader
                    // users can still explore the map and hear why a seat is not free.
                    aria-disabled={unavailable || undefined}
                    aria-pressed={status === 'selected' || status === 'mine'}
                    aria-label={t('seat.label', {
                      row: rowLabel(row),
                      number,
                      status: t(`seat.status.${status}`),
                    })}
                    onFocus={() => setCursor({ row, number })}
                    onClick={() => {
                      if (!unavailable) onToggle(seatId);
                    }}
                    sx={seatSx}
                  >
                    {number}
                  </Box>
                );
              })}
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

export function SeatMap({ sections, statusOf, onToggle, readOnly }: SeatMapProps) {
  const { t } = useTranslation(NAMESPACE);
  const { locale, localized } = useLocale();
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const active = sections.find((section) => section.id === activeId) ?? sections[0];

  if (!active) return null;

  return (
    <Stack spacing={2.5}>
      <Tabs
        value={active.id}
        onChange={(_event, next: string) => setActiveId(next)}
        aria-label={t('sectionTabs')}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {sections.map((section) => (
          <Tab
            key={section.id}
            value={section.id}
            id={`section-tab-${section.id}`}
            aria-controls={`section-panel-${section.id}`}
            label={
              <Box sx={{ textAlign: 'left' }}>
                <Box sx={{ fontWeight: 650 }}>{localized(section.name)}</Box>
                <Box sx={{ fontSize: '0.8rem', opacity: 0.8 }}>{formatMoney(section.priceCents, locale)}</Box>
              </Box>
            }
          />
        ))}
      </Tabs>

      <Box role="tabpanel" id={`section-panel-${active.id}`} aria-labelledby={`section-tab-${active.id}`}>
        <Box
          aria-hidden
          sx={{
            mx: 'auto',
            mb: 2.5,
            width: 'min(100%, 420px)',
            py: 0.75,
            textAlign: 'center',
            borderRadius: '0 0 60% 60% / 0 0 100% 100%',
            bgcolor: 'action.selected',
            color: 'text.secondary',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          {t('stage')}
        </Box>

        {/* Remount per section so the keyboard cursor restarts at the first seat. */}
        <SectionGrid key={active.id} section={active} statusOf={statusOf} onToggle={onToggle} readOnly={readOnly} />

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          {t('gridHint')}
        </Typography>
      </Box>

      <Stack
        direction="row"
        component="section"
        aria-label={t('legend.title')}
        sx={{ gap: 2.5, flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <LegendItem status="available" label={t('legend.available')} />
        <LegendItem status="selected" label={t('legend.selected')} />
        <LegendItem status="held" label={t('legend.held')} />
        <LegendItem status="sold" label={t('legend.sold')} />
      </Stack>
    </Stack>
  );
}

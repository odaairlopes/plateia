import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { NAMESPACE } from '../i18n';

interface HoldTimerProps {
  expiresAt: string;
  onExpire: () => void;
}

const URGENT_MS = 60_000;

export function HoldTimer({ expiresAt, onExpire }: HoldTimerProps) {
  const { t } = useTranslation(NAMESPACE);
  const remainingMs = useCountdown(expiresAt, onExpire);
  // The first reading is the full duration; it sizes the progress bar.
  const [totalMs] = useState(() => Math.max(remainingMs, 1));
  const urgent = remainingMs <= URGENT_MS;
  const time = formatCountdown(remainingMs);

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2,
        bgcolor: 'action.hover',
        border: 1,
        borderColor: urgent ? 'warning.main' : 'divider',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t('timer.label')}
        </Typography>
        {/* role="timer" is silent by design: a ticking clock must not flood screen readers. */}
        <Typography
          role="timer"
          aria-label={t('timer.expiresIn', { time })}
          sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '1.25rem' }}
        >
          {time}
        </Typography>
      </Stack>
      <LinearProgress
        aria-hidden
        variant="determinate"
        color={urgent ? 'warning' : 'primary'}
        value={Math.min(100, (remainingMs / totalMs) * 100)}
        sx={{ borderRadius: 99, height: 6 }}
      />
    </Box>
  );
}

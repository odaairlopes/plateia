import { LinearProgress, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  /** 0..1: shows a progress bar under the value. */
  progress?: number;
}

export function KpiCard({ label, value, hint, progress }: KpiCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="text.secondary" component="h3">
          {label}
        </Typography>
        <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {value}
        </Typography>
        {progress !== undefined ? (
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress * 100)}
            aria-hidden
            sx={{ height: 6, borderRadius: 99, mt: 0.5 }}
          />
        ) : null}
        {hint ? (
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}

interface ChartCardProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function ChartCard({ title, hint, children }: ChartCardProps) {
  return (
    <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, height: '100%', minWidth: 0 }}>
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
        {hint ? (
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Paper>
  );
}

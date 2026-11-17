import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

interface EventPosterProps {
  hue: number;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Generated cover art: each event carries only a hue, so there are no image
 * assets to host, lazy-load or write alt text for. The gradient stays dark in
 * both themes, which guarantees contrast for the white text placed on top.
 */
export function EventPoster({ hue, children, sx }: EventPosterProps) {
  return (
    <Box
      sx={[
        {
          position: 'relative',
          overflow: 'hidden',
          color: '#fff',
          background: `
            radial-gradient(120% 90% at 100% 0%, hsl(${(hue + 50) % 360} 85% 46% / 0.9), transparent 60%),
            radial-gradient(90% 80% at 0% 100%, hsl(${(hue + 320) % 360} 80% 30% / 0.9), transparent 65%),
            linear-gradient(140deg, hsl(${hue} 62% 24%), hsl(${(hue + 25) % 360} 68% 13%))`,
          '&::before, &::after': {
            content: '""',
            position: 'absolute',
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            pointerEvents: 'none',
          },
          '&::before': { width: '70%', aspectRatio: '1', right: '-22%', top: '-38%' },
          '&::after': { width: '46%', aspectRatio: '1', right: '-10%', top: '-20%' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ position: 'relative', zIndex: 1, height: '100%' }}>{children}</Box>
    </Box>
  );
}

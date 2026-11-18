import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { parseSeatId, rowLabel, type Dashboard } from '@plateia/contracts';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../hooks/useFormatters';
import { NAMESPACE } from '../i18n';

const seatLabel = (seatId: string) => {
  const seat = parseSeatId(seatId);
  return seat ? `${rowLabel(seat.row)}${seat.number}` : seatId;
};

export function RecentOrders({ orders, showEvent }: { orders: Dashboard['recentOrders']; showEvent: boolean }) {
  const { t } = useTranslation(NAMESPACE);
  const format = useFormatters();

  if (orders.length === 0) {
    return <Typography color="text.secondary">{t('recent.empty')}</Typography>;
  }

  return (
    <TableContainer>
      <Table size="small" aria-label={t('recent.title')}>
        <TableHead>
          <TableRow>
            <TableCell>{t('recent.code')}</TableCell>
            {showEvent ? <TableCell>{t('recent.event')}</TableCell> : null}
            <TableCell>{t('recent.buyer')}</TableCell>
            <TableCell>{t('recent.seats')}</TableCell>
            <TableCell align="right">{t('recent.total')}</TableCell>
            <TableCell align="right">{t('recent.when')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.code} hover>
              <TableCell sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{order.code}</TableCell>
              {showEvent ? (
                <TableCell sx={{ maxWidth: 220 }}>
                  <Typography variant="body2" noWrap>
                    {order.eventTitle}
                  </Typography>
                </TableCell>
              ) : null}
              <TableCell>
                <Typography variant="body2">{order.buyer}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {order.emailMasked}
                </Typography>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {order.seatIds.map((seatId) => (
                    <Chip key={seatId} label={seatLabel(seatId)} size="small" variant="outlined" />
                  ))}
                </Box>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {format.money(order.totalCents)}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                <time dateTime={order.confirmedAt}>{format.dateTime(order.confirmedAt)}</time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

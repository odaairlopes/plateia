import { Container, Typography } from '@mui/material';
import { AppProviders } from '@plateia/web-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import OrderPage from './pages/OrderPage';
import SeatSelectionPage from './pages/SeatSelectionPage';

/**
 * Standalone entry: lets the booking team run and test this micro frontend
 * without the shell. In production the shell imports the exposed pages instead.
 */
const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
          <Routes>
            <Route path="events/:eventId/seats" element={<SeatSelectionPage />} />
            <Route path="orders/:orderId" element={<OrderPage />} />
            <Route path="*" element={<Typography>Standalone booking: open /events/&lt;eventId&gt;/seats</Typography>} />
          </Routes>
        </Container>
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);

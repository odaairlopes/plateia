import { Container } from '@mui/material';
import { AppProviders } from '@plateia/web-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import EventDetailPage from './pages/EventDetailPage';
import EventsPage from './pages/EventsPage';

/**
 * Standalone entry: lets the catalog team run and test this micro frontend
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
            <Route index element={<EventsPage />} />
            <Route path="events/:eventId" element={<EventDetailPage />} />
          </Routes>
        </Container>
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);

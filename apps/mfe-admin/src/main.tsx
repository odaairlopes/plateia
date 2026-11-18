import { Container } from '@mui/material';
import { AppProviders } from '@plateia/web-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AdminApp from './AdminApp';

/** Standalone entry for developing the back office without the shell. */
const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
          <AdminApp />
        </Container>
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);

import { AppProviders } from '@plateia/web-kit';
import { lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NotFoundPage } from './components/NotFoundPage';
import { RemoteBoundary } from './components/RemoteBoundary';

// Loaded over the network at runtime, from whatever version each team deployed.
const EventsPage = lazy(() => import('catalog/EventsPage'));
const EventDetailPage = lazy(() => import('catalog/EventDetailPage'));
const SeatSelectionPage = lazy(() => import('booking/SeatSelectionPage'));
const OrderPage = lazy(() => import('booking/OrderPage'));
// Not linked from anywhere public: organizers go to /admin directly. Its code
// (charts included) is only downloaded when that route is opened.
const AdminApp = lazy(() => import('admin/AdminApp'));

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route
              index
              element={
                <RemoteBoundary>
                  <EventsPage />
                </RemoteBoundary>
              }
            />
            <Route
              path="events/:eventId"
              element={
                <RemoteBoundary>
                  <EventDetailPage />
                </RemoteBoundary>
              }
            />
            <Route
              path="events/:eventId/seats"
              element={
                <RemoteBoundary>
                  <SeatSelectionPage />
                </RemoteBoundary>
              }
            />
            <Route
              path="orders/:orderId"
              element={
                <RemoteBoundary>
                  <OrderPage />
                </RemoteBoundary>
              }
            />
            <Route
              path="admin/*"
              element={
                <RemoteBoundary>
                  <AdminApp />
                </RemoteBoundary>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}

const env = import.meta.env as Record<string, string | undefined>;

/** Public endpoints. Nothing secret may ever be placed in VITE_* variables. */
export const apiConfig = {
  catalogUrl: env.VITE_CATALOG_API_URL ?? 'http://localhost:3001',
  bookingUrl: env.VITE_BOOKING_API_URL ?? 'http://localhost:3002',
  backofficeUrl: env.VITE_BACKOFFICE_API_URL ?? 'http://localhost:3005',
} as const;

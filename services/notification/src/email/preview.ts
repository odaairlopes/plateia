/**
 * Renders the confirmation email to HTML files, with no SMTP and no database:
 * the fastest loop for working on the design.
 *
 *   npm run preview:email -w @plateia/notification-service
 *
 * Output: services/notification/.preview/order-confirmation-{pt,en}.html
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { EventDetail, Locale } from '@plateia/contracts';
import { composeOrderConfirmation } from './compose';
import { QR_CID } from './view';

const sampleEvent: EventDetail = {
  id: 'noite-de-vidro',
  title: 'Noite de Vidro — Turnê Reflexos',
  category: 'music',
  venue: 'Teatro Aurora',
  city: 'São Paulo, SP',
  startsAt: '2027-03-14T00:00:00.000Z',
  coverHue: 262,
  minPriceCents: 12000,
  description: { pt: '', en: '' },
  sections: [{ id: 'plateia', name: { pt: 'Plateia', en: 'Stalls' }, priceCents: 18000, rows: 8, seatsPerRow: 14 }],
};

const outDir = fileURLToPath(new URL('../../.preview/', import.meta.url));
await mkdir(outDir, { recursive: true });

for (const locale of ['pt', 'en'] satisfies Locale[]) {
  const email = await composeOrderConfirmation({
    appUrl: 'http://localhost:5173',
    event: sampleEvent,
    payload: {
      orderId: '17f4f71f-0000-4000-8000-000000000000',
      eventId: sampleEvent.id,
      seatIds: ['plateia:4:6', 'plateia:4:7'],
      totalCents: 36000,
      customer: { name: 'Marina Costa', email: 'marina@example.com' },
      locale,
    },
  });
  // Browsers do not resolve cid: links, so inline the QR for the preview only.
  const qr = email.attachments.find((attachment) => attachment.cid === QR_CID);
  const html = qr
    ? email.html.replaceAll(`cid:${QR_CID}`, `data:image/png;base64,${qr.content.toString('base64')}`)
    : email.html;
  const file = `${outDir}order-confirmation-${locale}.html`;
  await writeFile(file, html);
  console.log(`${email.subject}\n  → ${file}`);
}

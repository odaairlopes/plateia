import { render } from '@react-email/components';
import QRCode from 'qrcode';
import type { EventDetail, EventOf } from '@plateia/contracts';
import type { OutgoingEmail } from '../application/ports';
import { copy } from './copy';
import { OrderConfirmationEmail } from './OrderConfirmationEmail';
import { buildOrderConfirmationView, QR_CID } from './view';

export interface ComposeInput {
  payload: EventOf<'order.confirmed'>['payload'];
  event: EventDetail;
  appUrl: string;
}

/**
 * Builds the complete message: HTML, a plain-text alternative and the QR code.
 *
 * The QR travels as an inline attachment referenced by `cid:`. Data URIs are
 * stripped by Gmail and a hosted image would need a public server, so CID is
 * the option that renders in the most clients.
 */
export async function composeOrderConfirmation(input: ComposeInput): Promise<OutgoingEmail> {
  const view = buildOrderConfirmationView(input);
  const element = <OrderConfirmationEmail {...view} />;

  const [html, text, qr] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
    QRCode.toBuffer(`PLATEIA:${input.payload.orderId}`, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#17132A', light: '#FFFFFF' },
    }),
  ]);

  return {
    to: { name: view.holderName, address: input.payload.customer.email },
    subject: copy[view.locale].subject(view.event.title),
    // React 19 hoists image preloads into <head>; meaningless in an email client.
    html: html.replace(/<link rel="preload" as="image"[^>]*>/g, ''),
    text,
    attachments: [{ filename: `plateia-${view.orderCode}.png`, content: qr, contentType: 'image/png', cid: QR_CID }],
  };
}

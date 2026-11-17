import { describe, expect, it } from 'vitest';
import { createEvent, type EventDetail, type Locale } from '@plateia/contracts';
import { QR_CID } from '../email/view';
import type { ClaimResult, EmailKind, Mailer, NotificationLog, OutgoingEmail, SendOutcome } from './ports';
import { makeSendOrderConfirmation } from './send-order-confirmation';

const show: EventDetail = {
  id: 'noite-de-vidro',
  title: 'Noite de Vidro — Turnê Reflexos',
  category: 'music',
  venue: 'Teatro Aurora',
  city: 'São Paulo, SP',
  // 21:00 in São Paulo (UTC-3)
  startsAt: '2027-03-14T00:00:00.000Z',
  coverHue: 262,
  minPriceCents: 12000,
  description: { pt: '', en: '' },
  sections: [{ id: 'plateia', name: { pt: 'Plateia', en: 'Stalls' }, priceCents: 18000, rows: 8, seatsPerRow: 14 }],
};

class RecordingMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  failWith?: Error;

  async send(email: OutgoingEmail) {
    if (this.failWith) throw this.failWith;
    this.sent.push(email);
    return { messageId: `<${this.sent.length}@test>` };
  }
}

class InMemoryLog implements NotificationLog {
  readonly rows = new Map<string, { status: 'pending' | 'sent' | 'failed'; error?: string }>();

  async claim(orderId: string, kind: EmailKind): Promise<ClaimResult> {
    const key = `${orderId}|${kind}`;
    if (this.rows.get(key)?.status === 'sent') return 'already_sent';
    this.rows.set(key, { status: 'pending' });
    return 'claimed';
  }

  async markSent(orderId: string, kind: EmailKind) {
    this.rows.set(`${orderId}|${kind}`, { status: 'sent' });
  }

  async markFailed(orderId: string, kind: EmailKind, error: string) {
    this.rows.set(`${orderId}|${kind}`, { status: 'failed', error });
  }
}

const ORDER_ID = '17f4f71f-1111-4111-8111-111111111111';
// Intl uses non-breaking spaces in currencies and times; compare on plain text.
const normalize = (value: string) => value.replace(/[  ]/g, ' ');

function setup(locale: Locale = 'pt') {
  const mailer = new RecordingMailer();
  const log = new InMemoryLog();
  const outcomes: SendOutcome[] = [];
  const send = makeSendOrderConfirmation({
    catalog: { getEvent: async (id) => (id === show.id ? show : null) },
    mailer,
    log,
    appUrl: 'https://plateia.example',
    onOutcome: (outcome) => outcomes.push(outcome),
  });
  const event = createEvent('order.confirmed', {
    orderId: ORDER_ID,
    eventId: show.id,
    seatIds: ['plateia:3:7', 'plateia:3:8'],
    totalCents: 36000,
    customer: { name: 'Marina Costa', email: 'marina@example.com' },
    locale,
  });
  return { mailer, log, outcomes, send, event };
}

describe('order confirmation email', () => {
  it('sends the tickets to the customer, in Portuguese', async () => {
    const { mailer, send, event, outcomes } = setup('pt');
    await expect(send(event)).resolves.toBe('sent');

    const [email] = mailer.sent;
    expect(email?.to).toEqual({ name: 'Marina Costa', address: 'marina@example.com' });
    expect(email?.subject).toBe('Seus ingressos para Noite de Vidro — Turnê Reflexos');
    const html = normalize(email?.html ?? '');
    expect(html).toContain('Tudo certo, Marina!');
    expect(html).toContain('Plateia · C7');
    expect(html).toContain('Plateia · C8');
    expect(html).toContain('R$ 360,00');
    expect(html).toContain('17F4F71F');
    // Shown in the venue's time zone, whatever the server's is.
    expect(html).toContain('Sábado, 13 de março de 2027');
    expect(html).toContain('21:00');
    expect(html).toContain('20:00'); // doors open one hour earlier
    expect(outcomes).toEqual(['sent']);
  });

  it('follows the language the customer used on the site', async () => {
    const { mailer, send, event } = setup('en');
    await send(event);

    const [email] = mailer.sent;
    expect(email?.subject).toBe('Your tickets for Noite de Vidro — Turnê Reflexos');
    expect(normalize(email?.html ?? '')).toContain('Stalls · C7');
  });

  it('carries a plain-text version and the QR code as an inline image', async () => {
    const { mailer, send, event } = setup();
    await send(event);

    const [email] = mailer.sent;
    expect(email?.text).toContain('17F4F71F');
    expect(email?.html).toContain(`cid:${QR_CID}`);
    expect(email?.attachments).toHaveLength(1);
    expect(email?.attachments[0]).toMatchObject({ cid: QR_CID, contentType: 'image/png' });
    // PNG signature
    expect(email?.attachments[0]?.content.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('escapes what the customer typed', async () => {
    const { mailer, send } = setup();
    await send(
      createEvent('order.confirmed', {
        orderId: ORDER_ID,
        eventId: show.id,
        seatIds: ['plateia:1:1'],
        totalCents: 18000,
        customer: { name: '<img src=x onerror=alert(1)>', email: 'x@example.com' },
        locale: 'pt',
      }),
    );
    expect(mailer.sent[0]?.html).not.toContain('<img src=x');
  });

  it('does not email twice when the event is delivered again', async () => {
    const { mailer, send, event, outcomes } = setup();
    await send(event);
    await expect(send(event)).resolves.toBe('skipped_duplicate');

    expect(mailer.sent).toHaveLength(1);
    expect(outcomes).toEqual(['sent', 'skipped_duplicate']);
  });

  it('records the failure and rethrows so the bus retries', async () => {
    const { mailer, log, send, event, outcomes } = setup();
    mailer.failWith = new Error('SMTP connection refused');

    await expect(send(event)).rejects.toThrow('SMTP connection refused');
    expect(log.rows.get(`${ORDER_ID}|order_confirmed`)).toEqual({
      status: 'failed',
      error: 'SMTP connection refused',
    });
    expect(outcomes).toEqual(['failed']);

    // The retry goes through once SMTP is back.
    mailer.failWith = undefined;
    await expect(send(event)).resolves.toBe('sent');
  });

  it('fails loudly when the event is missing from the catalog', async () => {
    const { send } = setup();
    const orphan = createEvent('order.confirmed', {
      orderId: ORDER_ID,
      eventId: 'gone',
      seatIds: ['plateia:1:1'],
      totalCents: 18000,
      customer: { name: 'Marina Costa', email: 'marina@example.com' },
      locale: 'pt',
    });
    await expect(send(orphan)).rejects.toThrow('not found in the catalog');
  });
});

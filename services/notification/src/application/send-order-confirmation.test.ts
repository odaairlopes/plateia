import { describe, expect, it } from 'vitest';
import { createEvent, type EventDetail, type Locale } from '@plateia/contracts';
import { QR_CID } from '../email/view';
import type { ClaimResult, EmailKind, Mailer, NotificationLog, OutgoingEmail, SendLimits, SendOutcome } from './ports';
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

type Row = { status: 'pending' | 'sent' | 'failed' | 'suppressed'; error?: string; recipient?: string };

class InMemoryLog implements NotificationLog {
  readonly rows = new Map<string, Row>();

  async claim(orderId: string, kind: EmailKind, recipientHash: string): Promise<ClaimResult> {
    const key = `${orderId}|${kind}`;
    const status = this.rows.get(key)?.status;
    if (status === 'sent') return 'already_sent';
    if (status === 'suppressed') return 'already_suppressed';
    this.rows.set(key, { status: 'pending', recipient: recipientHash });
    return 'claimed';
  }

  private update(orderId: string, kind: EmailKind, change: Partial<Row>) {
    const key = `${orderId}|${kind}`;
    this.rows.set(key, { ...(this.rows.get(key) ?? { status: 'pending' }), ...change });
  }

  async markSent(orderId: string, kind: EmailKind) {
    this.update(orderId, kind, { status: 'sent', error: undefined });
  }

  async markFailed(orderId: string, kind: EmailKind, error: string) {
    this.update(orderId, kind, { status: 'failed', error });
  }

  async markSuppressed(orderId: string, kind: EmailKind, reason: string) {
    this.update(orderId, kind, { status: 'suppressed', error: reason });
  }

  async countSentSince(_since: Date, recipientHash?: string) {
    return [...this.rows.values()].filter(
      (row) => row.status === 'sent' && (recipientHash === undefined || row.recipient === recipientHash),
    ).length;
  }
}

const ORDER_ID = '17f4f71f-1111-4111-8111-111111111111';
// Intl uses non-breaking spaces in currencies and times; compare on plain text.
const normalize = (value: string) => value.replace(/[  ]/g, ' ');

function setup(locale: Locale = 'pt', limits?: SendLimits) {
  const mailer = new RecordingMailer();
  const log = new InMemoryLog();
  const outcomes: SendOutcome[] = [];
  const send = makeSendOrderConfirmation({
    catalog: { getEvent: async (id) => (id === show.id ? show : null) },
    mailer,
    log,
    appUrl: 'https://plateia.example',
    limits,
    hashRecipient: (email) => `hash:${email.toLowerCase()}`,
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
    expect(log.rows.get(`${ORDER_ID}|order_confirmed`)).toMatchObject({
      status: 'failed',
      error: 'SMTP connection refused',
    });
    expect(outcomes).toEqual(['failed']);

    // The retry goes through once SMTP is back.
    mailer.failWith = undefined;
    await expect(send(event)).resolves.toBe('sent');
  });

  it('stops mailing an address that already received its daily share', async () => {
    const { mailer, log, send, outcomes } = setup('pt', { perRecipientPerDay: 2, perDay: 100 });
    const order = (orderId: string, email: string) =>
      createEvent('order.confirmed', {
        orderId,
        eventId: show.id,
        seatIds: ['plateia:1:1'],
        totalCents: 18000,
        customer: { name: 'Marina Costa', email },
        locale: 'pt',
      });

    await send(order('00000000-0000-4000-8000-000000000001', 'target@example.com'));
    await send(order('00000000-0000-4000-8000-000000000002', 'TARGET@example.com'));
    await expect(send(order('00000000-0000-4000-8000-000000000003', 'target@example.com'))).resolves.toBe(
      'suppressed',
    );
    // Another address is unaffected.
    await expect(send(order('00000000-0000-4000-8000-000000000004', 'other@example.com'))).resolves.toBe('sent');

    expect(mailer.sent.map((email) => email.to.address)).toEqual([
      'target@example.com',
      'TARGET@example.com',
      'other@example.com',
    ]);
    expect(log.rows.get('00000000-0000-4000-8000-000000000003|order_confirmed')).toMatchObject({
      status: 'suppressed',
      error: 'recipient_limit',
    });
    // A redelivered suppressed event stays suppressed.
    await expect(send(order('00000000-0000-4000-8000-000000000003', 'target@example.com'))).resolves.toBe(
      'skipped_duplicate',
    );
    expect(outcomes).toEqual(['sent', 'sent', 'suppressed', 'sent', 'skipped_duplicate']);
  });

  it('stops all sending at the daily cap', async () => {
    const { mailer, send } = setup('pt', { perRecipientPerDay: 10, perDay: 1 });
    const order = (orderId: string, email: string) =>
      createEvent('order.confirmed', {
        orderId,
        eventId: show.id,
        seatIds: ['plateia:1:1'],
        totalCents: 18000,
        customer: { name: 'Marina Costa', email },
        locale: 'pt',
      });
    await send(order('00000000-0000-4000-8000-000000000001', 'a@example.com'));
    await expect(send(order('00000000-0000-4000-8000-000000000002', 'b@example.com'))).resolves.toBe('suppressed');
    expect(mailer.sent).toHaveLength(1);
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

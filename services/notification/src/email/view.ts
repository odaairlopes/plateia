import { parseSeatId, rowLabel, VENUE_TIME_ZONE, type EventDetail, type EventOf, type Locale } from '@plateia/contracts';
import { copy } from './copy';

/** Everything the template shows, already formatted. The template only lays it out. */
export interface OrderConfirmationView {
  locale: Locale;
  firstName: string;
  holderName: string;
  orderCode: string;
  event: {
    title: string;
    category: string;
    venue: string;
    city: string;
    date: string;
    time: string;
    doorsTime: string;
    /** Solid color derived from the event's cover hue (gradients are unreliable in email). */
    color: string;
  };
  seats: Array<{ label: string; price: string }>;
  total: string;
  eventUrl: string;
  calendarUrl: string;
  qrSrc: string;
}

export const QR_CID = 'ticket-qr';

const DOORS_BEFORE_MS = 60 * 60_000;
const ASSUMED_DURATION_MS = 3 * 60 * 60_000;

const INTL_LOCALE: Record<Locale, string> = { pt: 'pt-BR', en: 'en-US' };

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const value = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Google Calendar "add event" link: works in any browser, no attachment needed. */
function calendarLink(event: EventDetail, details: string): string {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(event.startsAt);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(start)}/${stamp(new Date(start.getTime() + ASSUMED_DURATION_MS))}`,
    location: `${event.venue}, ${event.city}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function buildOrderConfirmationView(input: {
  payload: EventOf<'order.confirmed'>['payload'];
  event: EventDetail;
  appUrl: string;
}): OrderConfirmationView {
  const { payload, event, appUrl } = input;
  const { locale } = payload;
  const text = copy[locale];
  const intl = INTL_LOCALE[locale];

  const money = new Intl.NumberFormat(intl, { style: 'currency', currency: 'BRL' });
  const dateFormat = new Intl.DateTimeFormat(intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: VENUE_TIME_ZONE,
  });
  const timeFormat = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: VENUE_TIME_ZONE });
  const startsAt = new Date(event.startsAt);

  const seats = payload.seatIds.map((seatId) => {
    const seat = parseSeatId(seatId);
    const section = seat ? event.sections.find((candidate) => candidate.id === seat.sectionId) : undefined;
    if (!seat || !section) return { label: seatId, price: '' };
    return {
      label: `${section.name[locale]} · ${rowLabel(seat.row)}${seat.number}`,
      price: money.format(section.priceCents / 100),
    };
  });

  const orderCode = payload.orderId.slice(0, 8).toUpperCase();
  const holderName = payload.customer.name.trim();
  const date = dateFormat.format(startsAt);

  return {
    locale,
    firstName: holderName.split(/\s+/)[0] ?? holderName,
    holderName,
    orderCode,
    event: {
      title: event.title,
      category: text.categories[event.category],
      venue: event.venue,
      city: event.city,
      date: date.charAt(0).toUpperCase() + date.slice(1),
      time: timeFormat.format(startsAt),
      doorsTime: timeFormat.format(new Date(startsAt.getTime() - DOORS_BEFORE_MS)),
      color: hslToHex(event.coverHue, 62, 30),
    },
    seats,
    total: money.format(payload.totalCents / 100),
    eventUrl: `${appUrl.replace(/\/$/, '')}/events/${encodeURIComponent(event.id)}`,
    calendarUrl: calendarLink(event, text.calendarDetails(seats.map((seat) => seat.label).join(', '), orderCode)),
    qrSrc: `cid:${QR_CID}`,
  };
}

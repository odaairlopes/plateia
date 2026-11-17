import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import type { CSSProperties } from 'react';
import { copy } from './copy';
import type { OrderConfirmationView } from './view';

/**
 * Email HTML is its own platform: no flexbox or grid, no external CSS, partial
 * support for border-radius and none for SVG or web fonts in some clients.
 * So: table layout (Section/Row/Column), inline styles only, solid colors
 * instead of gradients, a system font stack, and a design that still reads
 * well if images are blocked (the QR is the only image, and has alt text).
 */

const color = {
  page: '#F1EEF9',
  card: '#FFFFFF',
  ink: '#17132A',
  muted: '#5C5776',
  line: '#E6E1F5',
  brand: '#5B2BE0',
  brandSoft: '#F4F0FF',
  accent: '#FBBF24',
} as const;

const font = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";

const label: CSSProperties = {
  margin: '0 0 4px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: color.muted,
};

const value: CSSProperties = { margin: '0 0 16px', fontSize: '15px', lineHeight: '22px', color: color.ink };

export function OrderConfirmationEmail(view: OrderConfirmationView) {
  const text = copy[view.locale];
  const { event } = view;

  return (
    <Html lang={view.locale === 'pt' ? 'pt-BR' : 'en'}>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{text.preview(view.orderCode, event.date)}</Preview>
      <Body style={{ margin: 0, padding: '24px 0', backgroundColor: color.page, fontFamily: font }}>
        <Container style={{ width: '100%', maxWidth: '600px', margin: '0 auto', padding: '0 16px' }}>
          {/* Wordmark */}
          <Section style={{ padding: '8px 4px 20px' }}>
            <Text style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', color: color.brand }}>
              <span style={{ color: color.accent }}>●</span> plateia
            </Text>
          </Section>

          {/* Event "poster" */}
          <Section style={{ backgroundColor: event.color, borderRadius: '20px', padding: '32px 28px' }}>
            <Text style={{ ...label, color: '#FFFFFF', opacity: 0.85, margin: '0 0 12px' }}>
              {text.eyebrow} · {event.category}
            </Text>
            <Heading
              as="h1"
              style={{ margin: '0 0 12px', fontSize: '28px', lineHeight: '34px', fontWeight: 800, color: '#FFFFFF' }}
            >
              {event.title}
            </Heading>
            <Text style={{ margin: 0, fontSize: '15px', lineHeight: '22px', color: '#FFFFFF' }}>
              {event.date} · {event.time}
              <br />
              {event.venue}, {event.city}
            </Text>
          </Section>

          {/* Greeting */}
          <Section style={{ padding: '28px 4px 8px' }}>
            <Heading as="h2" style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 700, color: color.ink }}>
              {text.greeting(view.firstName)}
            </Heading>
            <Text style={{ margin: 0, fontSize: '15px', lineHeight: '24px', color: color.muted }}>{text.intro}</Text>
          </Section>

          {/* Ticket */}
          <Section
            style={{
              backgroundColor: color.card,
              border: `1px solid ${color.line}`,
              borderRadius: '16px',
              padding: '24px',
              marginTop: '20px',
            }}
          >
            <Row>
              <Column style={{ verticalAlign: 'top', paddingRight: '16px' }}>
                <Text style={label}>{text.when}</Text>
                <Text style={value}>
                  {event.date}
                  <br />
                  {event.time}
                </Text>
                <Text style={label}>{text.where}</Text>
                <Text style={value}>
                  {event.venue}
                  <br />
                  <span style={{ color: color.muted }}>{event.city}</span>
                </Text>
                <Text style={label}>{text.doors}</Text>
                <Text style={{ ...value, margin: 0 }}>{event.doorsTime}</Text>
              </Column>
              <Column style={{ width: '148px', verticalAlign: 'top', textAlign: 'center' }}>
                <Img
                  src={view.qrSrc}
                  width="140"
                  height="140"
                  alt={`QR code · ${view.orderCode}`}
                  style={{ display: 'block', margin: '0 auto', borderRadius: '8px' }}
                />
                <Text style={{ margin: '8px 0 0', fontSize: '12px', lineHeight: '16px', color: color.muted }}>
                  {text.qrHint}
                </Text>
              </Column>
            </Row>

            <Hr style={{ borderTop: `1px dashed ${color.line}`, margin: '24px 0 16px' }} />

            <Text style={label}>{text.seats}</Text>
            {view.seats.map((seat) => (
              <Row key={seat.label}>
                <Column>
                  <Text style={{ margin: '6px 0', fontSize: '15px', fontWeight: 600, color: color.ink }}>{seat.label}</Text>
                </Column>
                <Column style={{ textAlign: 'right' }}>
                  <Text style={{ margin: '6px 0', fontSize: '15px', color: color.muted }}>{seat.price}</Text>
                </Column>
              </Row>
            ))}

            <Hr style={{ borderTop: `1px solid ${color.line}`, margin: '12px 0' }} />

            <Row>
              <Column>
                <Text style={{ margin: '4px 0', fontSize: '15px', fontWeight: 700, color: color.ink }}>{text.total}</Text>
              </Column>
              <Column style={{ textAlign: 'right' }}>
                <Text style={{ margin: '4px 0', fontSize: '20px', fontWeight: 800, color: color.ink }}>{view.total}</Text>
              </Column>
            </Row>
            <Row>
              <Column>
                <Text style={{ margin: '4px 0', fontSize: '13px', color: color.muted }}>{text.orderCode}</Text>
              </Column>
              <Column style={{ textAlign: 'right' }}>
                <Text
                  style={{
                    margin: '4px 0',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
                    color: color.ink,
                  }}
                >
                  {view.orderCode}
                </Text>
              </Column>
            </Row>
          </Section>

          {/* Actions */}
          <Section style={{ padding: '24px 0 8px', textAlign: 'center' }}>
            <Button
              href={view.calendarUrl}
              style={{
                backgroundColor: color.brand,
                color: '#FFFFFF',
                borderRadius: '999px',
                padding: '14px 28px',
                fontSize: '15px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {text.addToCalendar}
            </Button>
            <Text style={{ margin: '14px 0 0', fontSize: '14px' }}>
              <Link href={view.eventUrl} style={{ color: color.brand, fontWeight: 600 }}>
                {text.viewEvent} →
              </Link>
            </Text>
          </Section>

          {/* Before the show */}
          <Section style={{ backgroundColor: color.brandSoft, borderRadius: '16px', padding: '20px 24px', marginTop: '16px' }}>
            <Heading as="h3" style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: color.ink }}>
              {text.beforeTheShow}
            </Heading>
            {text.tips(event.doorsTime, view.holderName).map((tip) => (
              <Text key={tip} style={{ margin: '6px 0', fontSize: '14px', lineHeight: '21px', color: color.ink }}>
                <span style={{ color: color.brand, fontWeight: 700 }}>✓</span>&nbsp;&nbsp;{tip}
              </Text>
            ))}
          </Section>

          {/* Footer */}
          <Section style={{ padding: '24px 4px 8px' }}>
            <Text style={{ margin: '0 0 6px', fontSize: '12px', lineHeight: '18px', color: color.muted }}>
              {text.footerReason}
            </Text>
            <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: color.muted }}>{text.footerDemo}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

import type { EventDetail } from '@plateia/contracts';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Content-ID, referenced from the HTML as `cid:<cid>` (inline image). */
  cid: string;
}

export interface OutgoingEmail {
  to: { name: string; address: string };
  subject: string;
  html: string;
  /** Plain-text alternative: shown by text-only clients and helps deliverability. */
  text: string;
  attachments: EmailAttachment[];
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
}

export type EmailKind = 'order_confirmed';

/** Outcome of trying to take responsibility for an email. */
export type ClaimResult = 'claimed' | 'already_sent';

/** Remembers which emails went out, so a redelivered event never sends twice. */
export interface NotificationLog {
  claim(orderId: string, kind: EmailKind): Promise<ClaimResult>;
  markSent(orderId: string, kind: EmailKind, messageId: string): Promise<void>;
  markFailed(orderId: string, kind: EmailKind, error: string): Promise<void>;
}

export interface CatalogReader {
  getEvent(eventId: string): Promise<EventDetail | null>;
}

export type SendOutcome = 'sent' | 'skipped_duplicate' | 'failed';

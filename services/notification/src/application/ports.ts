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
export type ClaimResult = 'claimed' | 'already_sent' | 'already_suppressed';

export type SuppressionReason = 'recipient_limit' | 'daily_limit';

/**
 * Remembers which emails went out, so a redelivered event never sends twice,
 * and counts recent sends for the anti-abuse limits. Recipients are only
 * known by an HMAC of their address.
 */
export interface NotificationLog {
  claim(orderId: string, kind: EmailKind, recipientHash: string): Promise<ClaimResult>;
  markSent(orderId: string, kind: EmailKind, messageId: string): Promise<void>;
  markFailed(orderId: string, kind: EmailKind, error: string): Promise<void>;
  markSuppressed(orderId: string, kind: EmailKind, reason: SuppressionReason): Promise<void>;
  countSentSince(since: Date, recipientHash?: string): Promise<number>;
}

export interface SendLimits {
  /** Emails one address may receive in 24 hours. */
  perRecipientPerDay: number;
  /** Emails the service may send in 24 hours (keeps the provider quota safe). */
  perDay: number;
}

export interface CatalogReader {
  getEvent(eventId: string): Promise<EventDetail | null>;
}

export type SendOutcome = 'sent' | 'skipped_duplicate' | 'suppressed' | 'failed';

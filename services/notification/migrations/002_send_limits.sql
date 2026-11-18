-- Send limits (anti-abuse): count emails per recipient without storing the
-- address. recipient_hash is an HMAC of the normalized address.
ALTER TABLE notification.emails ADD COLUMN recipient_hash text;
ALTER TABLE notification.emails DROP CONSTRAINT emails_status_check;
ALTER TABLE notification.emails
  ADD CONSTRAINT emails_status_check CHECK (status IN ('pending', 'sent', 'failed', 'suppressed'));
CREATE INDEX emails_recipient_recent_idx ON notification.emails (recipient_hash, updated_at) WHERE status = 'sent';
CREATE INDEX emails_sent_recent_idx ON notification.emails (updated_at) WHERE status = 'sent';

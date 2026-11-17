-- One row per email the service is responsible for. The primary key makes
-- sending idempotent: a redelivered event finds the row already 'sent'.
-- The recipient address is deliberately not stored: the log only needs to
-- know *that* an email went out, not to whom.
CREATE TABLE notification.emails (
  order_id    uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('order_confirmed')),
  status      text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  message_id  text,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, kind)
);

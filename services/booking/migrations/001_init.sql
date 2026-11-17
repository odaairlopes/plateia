CREATE TABLE booking.orders (
  id             uuid PRIMARY KEY,
  -- One order per hold: makes "create order" naturally idempotent on retries.
  hold_id        uuid NOT NULL UNIQUE,
  session_id     uuid NOT NULL,
  event_id       text NOT NULL,
  seat_ids       text[] NOT NULL,
  total_cents    integer NOT NULL CHECK (total_cents >= 0),
  customer_name  text NOT NULL,
  customer_email text NOT NULL,
  status         text NOT NULL CHECK (status IN ('pending_payment', 'confirmed', 'cancelled')),
  cancel_reason  text CHECK (cancel_reason IN ('payment_declined', 'seat_conflict', 'expired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_pending_idx ON booking.orders (created_at) WHERE status = 'pending_payment';

-- The source of truth for "who owns this seat". Redis holds are only a fast,
-- temporary reservation; this primary key is what makes double-selling impossible.
CREATE TABLE booking.tickets (
  event_id   text NOT NULL,
  seat_id    text NOT NULL,
  order_id   uuid NOT NULL REFERENCES booking.orders (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, seat_id)
);

CREATE INDEX tickets_order_idx ON booking.tickets (order_id);

CREATE TABLE booking.outbox (
  seq          bigserial PRIMARY KEY,
  event        jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX outbox_unpublished_idx ON booking.outbox (seq) WHERE published_at IS NULL;

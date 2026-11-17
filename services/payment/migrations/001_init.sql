CREATE TABLE payment.payments (
  id           uuid PRIMARY KEY,
  -- One payment per order: a redelivered `order.created` cannot charge twice.
  order_id     uuid NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  status       text NOT NULL CHECK (status IN ('approved', 'declined', 'refunded')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment.outbox (
  seq          bigserial PRIMARY KEY,
  event        jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX outbox_unpublished_idx ON payment.outbox (seq) WHERE published_at IS NULL;

-- Organizers own events and see their sales. Authentication lives here, in the
-- back office, not in the public-facing services.
CREATE TABLE backoffice.organizers (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE backoffice.organizer_events (
  event_id     text PRIMARY KEY,
  organizer_id uuid NOT NULL REFERENCES backoffice.organizers (id)
);

-- Read model (CQRS projection) of the orders, built from the domain events.
-- It can be dropped and rebuilt by replaying the stream. Only the masked
-- email is kept: organizers do not need the buyer's address here.
CREATE TABLE backoffice.orders (
  order_id              uuid PRIMARY KEY,
  event_id              text NOT NULL,
  status                text NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  cancel_reason         text,
  seat_ids              text[] NOT NULL,
  total_cents           integer NOT NULL,
  customer_name         text,
  customer_email_masked text,
  created_at            timestamptz NOT NULL,
  settled_at            timestamptz,
  -- 'events' = projected from the bus; 'seed' = demo data (npm run seed:demo).
  source                text NOT NULL DEFAULT 'events'
);

CREATE INDEX orders_reporting_idx ON backoffice.orders (event_id, status, settled_at);

CREATE TABLE backoffice.order_seats (
  order_id   uuid NOT NULL REFERENCES backoffice.orders (order_id) ON DELETE CASCADE,
  event_id   text NOT NULL,
  seat_id    text NOT NULL,
  section_id text NOT NULL,
  PRIMARY KEY (order_id, seat_id)
);

CREATE INDEX order_seats_event_idx ON backoffice.order_seats (event_id, section_id);

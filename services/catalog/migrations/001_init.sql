CREATE TABLE catalog.events (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  title       text NOT NULL,
  category    text NOT NULL CHECK (category IN ('music', 'theater', 'comedy', 'festival')),
  venue       text NOT NULL,
  city        text NOT NULL,
  starts_at   timestamptz NOT NULL,
  description jsonb NOT NULL,
  cover_hue   smallint NOT NULL CHECK (cover_hue BETWEEN 0 AND 360)
);

CREATE INDEX events_starts_at_idx ON catalog.events (starts_at);

CREATE TABLE catalog.sections (
  event_id      text NOT NULL REFERENCES catalog.events (id) ON DELETE CASCADE,
  id            text NOT NULL CHECK (id ~ '^[a-z0-9-]+$'),
  position      smallint NOT NULL,
  name          jsonb NOT NULL,
  price_cents   integer NOT NULL CHECK (price_cents >= 0),
  rows          smallint NOT NULL CHECK (rows BETWEEN 1 AND 26),
  seats_per_row smallint NOT NULL CHECK (seats_per_row BETWEEN 1 AND 40),
  PRIMARY KEY (event_id, id)
);

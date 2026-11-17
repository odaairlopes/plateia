-- Language the customer used on the site, so emails go out in it.
ALTER TABLE booking.orders
  ADD COLUMN locale text NOT NULL DEFAULT 'pt' CHECK (locale IN ('pt', 'en'));

-- W3C trace context captured when the event was enqueued, so the relay can
-- publish it as part of the trace that produced it.
ALTER TABLE booking.outbox ADD COLUMN trace_context jsonb;

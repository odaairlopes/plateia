// Telemetry must be running before Fastify, pg and ioredis are loaded, because
// instrumentation patches them at load time. The npm scripts guarantee that by
// preloading ./telemetry with `node --import`; importing it here as well keeps
// the service correct (if less instrumented) when started any other way.
import './telemetry';
import './server';

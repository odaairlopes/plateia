# Plateia

[![CI](https://github.com/odaairlopes/plateia/actions/workflows/ci.yml/badge.svg)](https://github.com/odaairlopes/plateia/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> Ticketing platform with real-time seat selection.
> Micro frontends with Module Federation, event-driven Fastify microservices, Postgres and Redis.

🇧🇷 [Leia em português](./README.md)

![Seat map with a hold in progress: sold seats, seats held by other visitors and the hold countdown](docs/images/seat-map-en.png)

Portfolio project. The events are fictional and the payment is simulated: no card data exists anywhere in the system.

## The problem

Selling tickets looks like CRUD until two people click the same seat in the same second. This project exists to handle that scenario well:

- **Nobody buys the same seat twice**, even with several replicas of the service.
- **The seat stays held while the visitor pays**, and goes back on sale by itself if they give up.
- **Payment is asynchronous** and may fail, arrive late or arrive twice without leaving the order inconsistent.
- **Everyone sees an up-to-date map** without reloading the page.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/images/events-en.png" alt="Event list" width="100%"></td>
    <td width="50%"><img src="docs/images/ticket-en.png" alt="Confirmed order with the issued ticket" width="100%"></td>
  </tr>
</table>

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    Shell["shell (host)\nlayout, routes, theme, language"]
    MC["mfe-catalog\nevents"]
    MB["mfe-booking\nseats and checkout"]
    Shell -. "Module Federation\n(loaded at runtime)" .-> MC
    Shell -. "Module Federation" .-> MB
  end

  MC -->|HTTP| Catalog
  MB -->|HTTP + SSE| Booking

  subgraph Services
    Catalog["catalog-service\nFastify"]
    Booking["booking-service\nFastify"]
    Payment["payment-service\nFastify"]
    Notification["notification-service\nFastify + React Email"]
  end

  Booking -->|"HTTP (cache + stale-if-error)"| Catalog
  Booking <-->|"Redis Streams\n(domain events)"| Payment
  Booking -.->|"order.confirmed"| Notification
  Notification -->|HTTP| Catalog
  Notification -->|SMTP| Mail[("Mailpit (local)\nor an SMTP provider")]

  Catalog --> PG[("Postgres\nschema per service")]
  Booking --> PG
  Payment --> PG
  Notification --> PG
  Booking --> Redis[("Redis\nholds, streams, pub/sub")]
```

| Part | Responsibility |
|---|---|
| `apps/shell` | Host. Layout, routes, light/dark theme, language. Isolates each remote's failures with an error boundary. |
| `apps/mfe-catalog` | Remote. Event list and detail. |
| `apps/mfe-booking` | Remote. Real-time seat map, hold, checkout and order tracking. |
| `services/catalog` | Read model of events and sections. |
| `services/booking` | Temporary holds (Redis), orders and tickets (Postgres), checkout saga. |
| `services/payment` | Simulated payment provider, driven only by events. |
| `services/notification` | Emails the tickets once an order is confirmed. |
| `packages/contracts` | Zod schemas for APIs and events. A single source of truth for back end and front end. |
| `packages/platform` | Service foundation: HTTP factory, event bus, outbox, migrations. |
| `packages/web-kit` | Front-end foundation: theme, providers, i18n, HTTP client. |

## The purchase flow

```mermaid
sequenceDiagram
  actor U as Visitor
  participant B as booking-service
  participant R as Redis
  participant P as payment-service
  participant DB as Postgres

  U->>B: POST /holds (seats)
  B->>R: Lua script: all-or-nothing hold with TTL
  B-->>U: 201 hold (expires in 5 min)
  Note over B,R: Pub/Sub notifies replicas, SSE notifies browsers

  U->>B: POST /orders (holdId)
  B->>DB: transaction: pending order + outbox(order.created)
  B-->>U: 202 pending order
  B-)P: order.created (Redis Streams)
  P->>DB: transaction: payment + outbox(payment.succeeded)
  P-)B: payment.succeeded
  B->>DB: transaction: tickets (PK event+seat) + confirmed order
  U->>B: GET /orders/:id (polling)
  B-->>U: confirmed
```

If the payment is declined, the order is cancelled and the seats go back on sale. If the hold expires during payment and someone else buys the seat, the order is cancelled and an `order.cancelled` event triggers the refund in the payment service (the saga's compensating action).

Once the order is confirmed, the notification service emails the tickets, with a QR code, in the language the visitor used on the site.

## Architecture decisions and trade-offs

**Two layers against double-selling.** The temporary hold lives in Redis: one key per seat with a TTL, acquired by a Lua script so several seats are held atomically. It is fast and cleans up after itself. The final guarantee, though, is the `(event_id, seat_id)` primary key of the tickets table in Postgres. Even if Redis loses data, the database refuses the second sale. *Trade-off:* two sources of state for the seat map, merged on read.

**Transactional outbox instead of publishing straight to the broker.** Writing to the database and publishing an event are two operations; one can fail without the other. The event is stored in the same transaction as the state change and a relay publishes it afterwards (`FOR UPDATE SKIP LOCKED`, safe with several replicas). *Trade-off:* at-least-once delivery, so every consumer must be idempotent. Here idempotency comes from unique constraints (`hold_id` on orders, `order_id` on payments) and from checking the state before acting.

**Choreographed saga.** Services react to events, with no central orchestrator. For three steps, it is the simplest design. *Trade-off:* the flow is spread out; with more participants an orchestrator would start to pay off.

**Redis Streams as the bus.** Consumer groups, explicit acknowledgement, retries with backoff and a dead-letter stream. Redis was already in the stack for the holds, which avoids operating Kafka or RabbitMQ as well. *Trade-off:* weaker retention and per-partition ordering guarantees than Kafka.

**SSE that only signals.** The server only says "something changed"; the browser refetches the seat map. A lost message or a reconnect can never leave the screen wrong. *Trade-off:* one extra request per change, in exchange for no duplicated state on the client.

**Guarded synchronous call from booking to catalog.** Booking needs prices and the venue layout. The call has a timeout, a short cache, and serves the last known value if the catalog is down. *Trade-off:* a price change takes up to 30 s to reach booking. The next step would be replicating the catalog through events.

**Micro frontends with a minimal contract.** Each remote exposes only prop-less pages; data flows through the URL and shared singletons (React, router, MUI, React Query, i18next). Each remote registers its own translations and runs by itself in standalone mode. *Trade-off:* the versions of the shared dependencies must move together.

**Prices computed on the server.** The client sends only seat identifiers; the total always comes from the catalog.

**No login, for now.** An anonymous session id tells "my hold" from someone else's. It is not authentication, and this README does not pretend it is. Orders from another session answer 404, without revealing that they exist.

## Stack

- **Front end:** React 19, TypeScript, Vite 8, Module Federation (`@module-federation/vite`), Material UI 9, React Query, React Router, React Hook Form, Zod, i18next
- **Back end:** Node.js, Fastify 5, Zod (`fastify-type-provider-zod`), OpenAPI/Swagger
- **Data:** PostgreSQL 17, Redis 8 (keys with TTL, Lua scripts, Streams, Pub/Sub)
- **Observability:** OpenTelemetry (SDK + Collector), Jaeger, Prometheus, Grafana
- **Tests:** Vitest
- **Local infra:** Docker Compose, npm workspaces

## Running it

Requirements: Node.js 22+ and Docker.

```bash
npm install
npm run infra:up   # Postgres (5433) and Redis (6380)
npm run dev        # 3 services + 3 web apps
```

Open http://localhost:5173. Migrations and sample data are applied when the services start. No `.env` is needed; see `.env.example` to override values.

| Address | What |
|---|---|
| http://localhost:5173 | Application (shell) |
| http://localhost:5174 · 5175 | Micro frontends in standalone mode |
| http://localhost:3001/docs | Catalog OpenAPI |
| http://localhost:3002/docs | Booking OpenAPI |
| http://localhost:8025 | Mailpit: local inbox with every email sent |

To see the concurrency, open the same event in two windows (one of them private): a seat held in one shows up as blocked in the other in real time.

```bash
npm test           # domain and use case tests
npm run typecheck  # strict TypeScript across all workspaces
npm run smoke      # end-to-end purchase flow against the running services
```

## Observability

```bash
npm run obs:up   # Collector, Jaeger, Prometheus and Grafana
```

| Address | What |
|---|---|
| http://localhost:3030 | Grafana, with the "Plateia — Overview" dashboard already provisioned |
| http://localhost:16686 | Jaeger: distributed traces |
| http://localhost:9090 | Prometheus |

![Grafana dashboard with the business flow and HTTP signals](docs/images/grafana.png)

![Jaeger trace of one purchase across the booking and payment services](docs/images/jaeger-trace.png)

*One purchase trace in Jaeger: 37 spans across two services, from the HTTP request to the issued tickets, through the queue.*

Services export everything over OTLP to the **OpenTelemetry Collector**, which forwards traces to Jaeger and exposes metrics to Prometheus. A service does not know where its telemetry goes; changing the destination is a Collector configuration change, with no redeploy. With the stack down, exports fail silently and nothing changes for the application.

**One trace per purchase, across services and the queue.** The trace context (W3C `traceparent`) is stored next to the event in the outbox and travels inside the Redis Streams message. So `POST /orders`, the publishing of `order.created`, its processing in the payment service, the `payment.succeeded` coming back and the tickets being issued all show up as a single trace, even though the outbox relay runs outside any request.

**Business metrics, not only infrastructure:** hold attempts by outcome (`held`, `seats_unavailable`…), domain events published and consumed, delivery lag and processing time per event, executions that went to retry or dead-letter, and open SSE connections. HTTP metrics (rate, latency, errors per route) come from auto-instrumentation.

**Correlated logs:** every log line carries `trace_id` and `span_id`.

Decisions: business metrics are applied as decorators at the composition root, so the application layer and its tests know nothing about telemetry. Queries from background loops (outbox relay, stream reads) produce no spans, so they do not drown the real traces. Host and process detectors are off, avoiding high-cardinality labels and machine details in the metrics.

## Confirmation email

![Confirmation email with the show details, seats, total and QR code](docs/images/email-en.png)

When an order is confirmed, `notification-service` consumes the `order.confirmed` event and emails the tickets.

- **React template** with [React Email](https://react.email): table layout, inline styles, solid colors and system fonts, which is what email clients (Gmail, Outlook, Apple Mail) actually support. A plain-text version goes along.
- **QR code as an inline attachment** (`cid:`): Gmail strips data-URI images, and a hosted image would need a public server.
- **In the site's language:** the order stores the language the visitor bought in, and dates and times are shown in the venue's time zone, whatever the server's is.
- **No duplicate emails:** the bus delivers at least once, so each send is logged under `(order, kind)`. A redelivered event does not send again. The log does not store the email address.
- **No replaying the past:** a new consumer of an event with external side effects starts at the end of the stream (`startFrom: 'latest'`). Starting at the beginning would email every past customer.
- **Data carried in the event:** `order.confirmed` carries name, email and language, so notifications never call back into booking. In exchange, personal data travels on the bus, and the stream must be treated as sensitive storage.

### Where the emails go

In development no email leaves the machine: [Mailpit](https://mailpit.axllent.org) receives everything over SMTP and shows it at http://localhost:8025. To see the template with no SMTP or database:

```bash
npm run preview:email -w @plateia/notification-service
```

To deliver for real, point SMTP at a provider. [Brevo](https://www.brevo.com), for example, has a free plan of 300 emails a day. Copy `.env.example` to `.env` and fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` (a sender verified with the provider). No code changes.

## Tests

The business rules depend on ports (interfaces), not on Postgres or Redis, so the use cases are tested with in-memory implementations: two visitors racing for the same seat, hold expiry, checkout idempotency, a duplicated payment event, compensation when the seat is sold to someone else, and a payment that arrives after the order expired.

The smoke test (`scripts/smoke.ts`) covers what unit tests cannot reach: real Postgres and Redis, the Lua hold scripts, the outbox relay and the saga across two services. It buys seats and checks that a second visitor cannot hold them, that a repeated checkout does not duplicate the order, that a declined payment releases the seat that an order is not visible to another session and that the ticket email arrives with the order code and the QR code.

### Continuous integration

GitHub Actions runs on every push and pull request:

1. **Quality**, on Node 22 (lowest supported) and 24 (LTS): strict typecheck, unit tests and the micro frontend build.
2. **Smoke**, after quality: starts Postgres, Redis and Mailpit as service containers, boots the four services and runs `npm run smoke`. On failure, the service logs are kept as an artifact.

The workflow has read-only permissions, cancels superseded runs on the same branch and pins actions to commit SHAs (a tag can be moved; a SHA cannot). Dependabot updates dependencies and actions weekly, grouping packages that must move together (OpenTelemetry, and the singletons shared across micro frontends).

## Accessibility

- Keyboard-navigable seat map (arrows, Home/End) with a roving tabindex: the map is a single Tab stop.
- Seat state never relies on color alone: each state has its own border, pattern and text alternative.
- Focus moves to the content on every navigation, a "skip to content" link, `aria-live` regions for notices.
- AA contrast in light and dark themes; honors `prefers-reduced-motion`.

## Next steps

- [ ] Integration tests with Testcontainers and E2E with Playwright (including a race between two browsers)
- [ ] Multi-stage Dockerfiles and image publishing from CI
- [ ] Authentication and a "my tickets" area
- [ ] Replicate the catalog into booking through events, removing the synchronous call
- [ ] Traces starting in the browser and Prometheus alerts
- [ ] Virtual waiting room for high-demand sale openings
- [ ] Before using a real email provider in production: a per-recipient send limit and address confirmation, so checkout cannot be used to send spam

## License

[MIT](./LICENSE).

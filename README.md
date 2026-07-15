# gymkartel-backend

Production-grade backend for **Gym Kartel** — a multi-tier gym-membership app for India (UPI-first). Built with **Effect-TS** for all business logic, **GraphQL Yoga** at the edge, **MongoDB / Redis / RabbitMQ** infrastructure, and **Razorpay** for payments. TypeScript in the strictest mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

The GraphQL wire contract and all pricing/domain schemas live in the pre-built [`@gymkartel/contracts`](packages/contracts) package — the **single source of truth**. Nothing in this repo hardcodes a price or re-declares a domain shape; it depends on contracts via `workspace:*`.

## Architecture

- **Monorepo**: pnpm workspaces + Turborepo. `apps/*`, `packages/*`.
- **Effect-TS everywhere**: services are `Layer`s, failures are `Data.TaggedError`s that never cross a boundary as raw throws, structured concurrency via `Effect.all`. Resolvers are **thin adapters** that build an Effect and run it on a shared `ManagedRuntime` at the edge only.
- **Feature-first layering** — every feature under `apps/api/src/features/<feature>/`:
  - `domain/` — pure logic (zero deps beyond `effect` + contracts)
  - `application/` — Effect services + **ports** (Context.Tag interfaces)
  - `infrastructure/` — adapters (the only layer importing driver SDKs); each port has an in-memory adapter (tests / infra-free runtime) and a driver-backed adapter (production)
  - `interface/` — GraphQL resolvers / subscriptions
  - `__tests__/`
- **Shared kernel** (`apps/api/src/shared/`): config, logger (Pino + PII redaction + request-id via `AsyncLocalStorage`), telemetry (OpenTelemetry + Sentry), clock, ids, auth/JWT, Mongo/Redis/RabbitMQ layers, R2 storage, in-memory persistence kit.
- **Composition root**: `apps/api/src/runtime/runtime.ts` wires every service against the in-memory adapters so the API **boots without Mongo/Redis/Rabbit**. The production root swaps in the driver-backed layers — the application layer is byte-identical because everything is injected through the same Effect ports.

```
apps/
  api/        GraphQL Yoga API + all feature logic
  workers/    RabbitMQ consumers (DLX + retry-with-backoff)
packages/
  contracts/       @gymkartel/contracts (pre-built, DO NOT EDIT)
  eslint-config/   @gymkartel/eslint-config (shared flat config)
```

## Features

| # | Feature | Highlights |
|---|---------|-----------|
| 1 | **auth** | phone+OTP (Redis, rate-limited), short-lived JWT access + rotating refresh families |
| 2 | **passes** | `passLadder` (viewer tier only), `createPassOrder`, webhook activation, day roll-over on renew — prices come only from contracts |
| 3/4 | **check-in** | `syncCheckIn` idempotent on `idempotencyKey`; top-up sheet (never a wall) with a created Razorpay order; consumes one pass-day per IST day; publishes `checkin.recorded` |
| 5 | **gyms / coaches / bookings** | tier-scoped gyms + peek, live-busy meter, coach browse/take-home preview, slot booking + pay + idempotent cancel + insurance badge |
| 6 | **ledger** | free-text workout parser → chips with amber `?` on uncertain tokens (never a silent guess), PR flags, coach-logged sessions |
| 7 | **streaks-ranks / leaderboards** | IST-correct streak rule (3+/7 → alive, every 2 weeks = +1 free day), public rank ladder, ZONE/STATE/INDIA segments with monthly seasons + sticky self-row (attendance only, never money) |
| 8 | **chat** | unlocks post-booking, **mandatory PII masking both directions**, location-share pin auto-expiring at session end |
| 12 | **safety** | SOS (emergency / trusted-contact alert w/ live location / incident report), incident escalation, trusted-contact management |
| 13 | **payments** | Razorpay client, signature-verified webhooks, idempotent order reconciliation keyed by order id — client-reported status is never trusted |
| 14 | **notifications** | `NotificationService` port + Brevo (SMS/email/WhatsApp) + Expo push adapters, versioned template ids |
| 15 | **coach-portal** | dashboard (today, pending, earnings, rating), calendar, clients, T+2 earnings + take-home preview |
| 16 | **version-gate** | `versionGate` query for soft-prompt / hard-gate |

## Getting started

```bash
pnpm install
cp .env.example .env          # fill secrets for production; dev has safe defaults
pnpm -r typecheck             # strict typecheck across the workspace
pnpm -r test                  # unit tests (no Docker needed)
pnpm --filter @gymkartel/api dev      # boots the GraphQL server on :4000 (infra-free)
pnpm --filter @gymkartel/api indexes  # applies Mongo indexes (needs a live Mongo)
```

- GraphQL endpoint: `POST http://localhost:4000/graphql` (GraphiQL in dev)
- Razorpay webhook: `POST http://localhost:4000/webhooks/razorpay` (`x-razorpay-signature`)
- Health / readiness: `GET /health`, `GET /ready`

A Postman collection covering every major operation plus a Razorpay webhook simulation is in [`postman/`](postman).

## Testing

Vitest. Pure domain gets the hardest coverage:
- **streak / IST date-boundary** — property tests via `fast-check`
- **pricing selection, top-up cost, rank thresholds**
- **money paths** (pass activation, webhook idempotency, amount-tampering rejection)
- **check-in idempotency** (retry/duplicate/replay collapse to one check-in)
- application services with in-memory fake ports; interface resolver tests run real queries through Yoga; the SDL is snapshotted.

Infra tests that need Docker are suffixed `*.infra.test.ts` and excluded from the default run.

## Error handling

Every failure mode is a tagged error (`Data.TaggedError`). The edge adapter (`shared/errors/errors.ts` → `toGraphQLError`) maps each `_tag` to a stable GraphQL extension `code` (e.g. `TOP_UP_REQUIRED`, `NO_ACTIVE_PASS`, `DUPLICATE_CHECKIN`) and never leaks internal causes. PII (phone / UPI / auth / payment tokens) is redacted in logs by Pino config.

## Notes & deliberate scope choices

- The pre-built `@gymkartel/contracts` GraphQL SDL defines the exposed operations; features beyond that surface (chat, ledger, leaderboards, safety, coach-portal, streak recompute) are complete at the **domain + application** layer and consumed by the workers, ready to be exposed when the contract grows.
- `UserRepoMongo` is the canonical Mongo adapter (Zod-validated at the boundary); the other entity repos follow the identical pattern.
- Where the brief left a tool unspecified the sensible default was chosen and noted inline (e.g. `femaleOnly` coach filter keys off a specialty marker since the contract has no gender field).

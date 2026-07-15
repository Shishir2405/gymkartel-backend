# Infrastructure

Gym Kartel runs on in-memory adapters by default, so the API and workers boot
and `pnpm -r test` passes **without any containers**. This directory + the
root `docker-compose.yml` provide the real backing services and the production
Terraform skeleton for when you want the driver-backed stack.

## Local backing services (`docker-compose.yml`)

```bash
docker compose up -d      # Mongo (RS) + Redis + RabbitMQ + MinIO
docker compose ps         # wait for healthchecks to go healthy
docker compose down       # stop (add -v to wipe volumes)
```

Services:

| Service   | Port(s)        | Purpose                                                       |
| --------- | -------------- | ------------------------------------------------------------ |
| mongo     | 27017          | Primary datastore — **single-node replica set `rs0`**        |
| redis     | 6379           | Sessions / OTP + idempotency keys / leaderboard hot cache    |
| rabbitmq  | 5672, 15672    | Event fan-out (check-in recorded, incident escalation, …)    |
| minio     | 9000, 9001     | S3-compatible object storage (share cards, coach docs, …)    |

### Why a replica set for a single node

The app uses MongoDB **change streams** (leaderboard hot-cache and the
live-busy meter), and change streams require a replica set even for one node.
The compose file starts Mongo with `--replSet rs0` and a `mongo-init` one-shot
initiates the RS on first boot. When pointing the app at it, use a replica-set
connection string:

```
MONGO_URI=mongodb://localhost:27017/?replicaSet=rs0
```

MinIO buckets (`gymkartel-share-cards`, `gymkartel-coach-docs`,
`gymkartel-transformations`) are created by the `minio-setup` one-shot.

## The `PERSISTENCE` toggle

The composition root (`apps/api/src/runtime/runtime.ts`) selects one of two
interchangeable infrastructure stacks — both expose the exact same Effect
ports, so the application/service wiring is identical:

- **`PERSISTENCE=memory`** (default): in-memory adapters + seed fixtures. No
  Docker. This is what every test and `pnpm dev` use.
- **`PERSISTENCE=mongo`**: MongoDB repos (validated at the boundary with the
  `@gymkartel/contracts` Zod schemas), Redis-backed OTP/session/rate-limit
  stores, RabbitMQ event publishers, and the live Razorpay gateway.

```bash
# Full driver-backed stack against docker-compose:
docker compose up -d
PERSISTENCE=mongo MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" \
  pnpm --filter @gymkartel/api dev
```

Apply the code-defined indexes (idempotent) once Mongo is up:

```bash
PERSISTENCE=mongo MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" \
  pnpm --filter @gymkartel/api indexes
```

Index definitions live in `apps/api/src/shared/db/indexes.ts` (including the
called-out `checkIns {userId:1,gymId:1,scannedAt:-1}` and
`leaderboardEntries {zone:1,season:1,streak:-1}`).

## Integration tests

Adapter unit tests (Zod boundary / mapping) run in the default suite with a
faked driver. Tests that need a **live** Mongo/Redis/Rabbit are gated behind
`INTEGRATION=1` and skipped otherwise, so the default `pnpm -r test` never
depends on containers:

```bash
docker compose up -d
INTEGRATION=1 MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" \
  pnpm --filter @gymkartel/api test
```

## Terraform (`main.tf`) — SKELETON

`main.tf` declares the production shape (MongoDB Atlas replica set, Redis,
CloudAMQP RabbitMQ, Cloudflare R2). It is a **skeleton**, not apply-ready:

- No remote state backend is configured — add an `s3` backend (bucket +
  DynamoDB lock) per environment before collaborating.
- Provider credentials + all `sensitive` variables must be supplied via a
  secrets manager (Doppler / AWS Secrets Manager), never committed.
- Run `terraform validate` to sanity-check shapes; **do not** `terraform apply`
  until state + secrets are wired.

# Load tests (k6)

Load scripts for the two backend hotspots the brief calls out:

| Script               | Hotspot                                    |
| -------------------- | ------------------------------------------ |
| `checkin-burst.js`   | Check-in burst at gym opening hours        |
| `leaderboard.js`     | Leaderboard recompute + read under load    |

These are **not** part of CI and need no npm dependency — [k6](https://k6.io) is
a standalone binary. They drive the running GraphQL API over HTTP, so they are
never invoked by `pnpm -r test`.

## Prerequisites

1. Install k6 (`brew install k6`, or see the k6 docs).
2. A running API to hit. For a realistic run use the driver-backed stack:

   ```bash
   docker compose up -d
   PERSISTENCE=mongo MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" \
     pnpm --filter @gymkartel/api start
   ```

   (The default in-memory stack works too for a smoke run, but it won't reflect
   Mongo/Redis behaviour under load.)

3. A valid **Bearer access token** for a member with an active pass — mint one
   through the auth flow and pass it as `TOKEN`.

## Running

Every script is parameterised with `-e KEY=value` env vars (all optional except
`TOKEN` for a real run). `BASE_URL` defaults to `http://localhost:4000`.

```bash
# Check-in opening-hours burst (open-model, ramps to a request-rate peak):
k6 run -e BASE_URL=http://localhost:4000 -e TOKEN="$ACCESS_TOKEN" \
       -e GYM_CODE=GYM-IRON-001 -e PEAK_RATE=200 -e HOLD=1m \
       load/checkin-burst.js

# Leaderboard read load with concurrent recompute writes:
k6 run -e BASE_URL=http://localhost:4000 -e TOKEN="$ACCESS_TOKEN" \
       -e SCOPE_KEY=koramangala -e READ_RATE=300 -e WRITE_RATE=10 -e DURATION=2m \
       load/leaderboard.js
```

### Tunable env vars

`checkin-burst.js`: `BASE_URL`, `TOKEN`, `GYM_CODE`, `PEAK_RATE` (default 200),
`RAMP` (30s), `HOLD` (1m), `REPLAY_PCT` (10 — share of iterations that replay a
prior `idempotencyKey` to exercise the offline-dedup path).

`leaderboard.js`: `BASE_URL`, `TOKEN`, `SCOPE_KEY` (koramangala), `STATE_KEY`
(KA), `READ_RATE` (300), `WRITE_RATE` (10), `GYM_CODE`, `DURATION` (2m).

## Target thresholds

The scripts encode these as k6 `thresholds`, so the run exits non-zero if any
SLO is breached (usable as a manual gate before a release):

| Metric                                    | Threshold        |
| ----------------------------------------- | ---------------- |
| Check-in sync latency p95                 | < 400 ms         |
| Check-in sync latency p99                 | < 800 ms         |
| Check-in sync error rate                  | < 1%             |
| Leaderboard read latency p95              | < 300 ms         |
| Leaderboard read latency p99              | < 600 ms         |
| Leaderboard read error rate               | < 1%             |
| Recompute (check-in) write error rate     | < 2%             |
| Overall `http_req_failed`                 | < 1%             |

Tune `PEAK_RATE` / `READ_RATE` upward until a threshold breaks to find the knee
of the curve; that request rate is your current capacity ceiling for the tier.

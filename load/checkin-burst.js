import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * Hotspot #1 — the check-in burst at gym opening hours.
 *
 * Models the 6–9am spike when a whole city taps the scanner at once. Uses the
 * `ramping-arrival-rate` executor so we drive a target REQUEST rate (open model)
 * rather than a fixed VU count — the server, not the load generator, sets the
 * pace, which is what you want when measuring how a spike is absorbed.
 *
 * Each iteration syncs one check-in over GraphQL. A slice of traffic replays a
 * previously-used idempotencyKey to exercise the offline-replay dedup path (the
 * server must collapse it, cheaply, to the same stored check-in).
 *
 * Params (k6 env vars, `-e KEY=value`):
 *   BASE_URL   API origin              (default http://localhost:4000)
 *   TOKEN      Bearer access token     (required for a real run)
 *   GYM_CODE   gym check-in QR code    (default GYM-IRON-001)
 *   PEAK_RATE  req/s at the spike peak (default 200)
 *   RAMP       ramp-to-peak duration   (default 30s)
 *   HOLD       hold-at-peak duration   (default 1m)
 *   REPLAY_PCT % of iters that replay a prior key (default 10)
 */
const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const TOKEN = __ENV.TOKEN || "";
const GYM_CODE = __ENV.GYM_CODE || "GYM-IRON-001";
const PEAK_RATE = Number(__ENV.PEAK_RATE || 200);
const RAMP = __ENV.RAMP || "30s";
const HOLD = __ENV.HOLD || "1m";
const REPLAY_PCT = Number(__ENV.REPLAY_PCT || 10);

const errorRate = new Rate("checkin_errors");
const checkinLatency = new Trend("checkin_latency_ms", true);

export const options = {
  scenarios: {
    opening_burst: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { target: PEAK_RATE, duration: RAMP }, // ramp into the doors-open spike
        { target: PEAK_RATE, duration: HOLD }, // hold the peak
        { target: 5, duration: "20s" }, // drain
      ],
    },
  },
  thresholds: {
    // p95 under 400ms and p99 under 800ms for the write path.
    checkin_latency_ms: ["p(95)<400", "p(99)<800"],
    // Fewer than 1% of syncs may error (HTTP or GraphQL-level).
    checkin_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

const SYNC_MUTATION = `
mutation Sync($input: SyncCheckInInput!) {
  syncCheckIn(input: $input) {
    checkIn { id scannedAt }
    topUpRequired { amountPaise razorpayOrderId }
  }
}`;

const headers = {
  "Content-Type": "application/json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

export default function () {
  const replay = Math.random() * 100 < REPLAY_PCT;
  // A replayed key is stable per-VU; a fresh key is unique per iteration.
  const idempotencyKey = replay
    ? `k6-replay-vu-${__VU}`
    : `k6-${__VU}-${__ITER}-${Date.now()}`;

  const body = JSON.stringify({
    query: SYNC_MUTATION,
    variables: {
      input: {
        gymCheckInCode: GYM_CODE,
        scannedAt: new Date().toISOString(),
        idempotencyKey,
        acceptedTopUp: false,
      },
    },
  });

  const res = http.post(`${BASE_URL}/graphql`, body, { headers });
  checkinLatency.add(res.timings.duration);

  let json;
  try {
    json = res.json();
  } catch (_e) {
    json = null;
  }
  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "no graphql errors": () => json !== null && !json.errors,
    "has result payload": () => json !== null && !!json.data && !!json.data.syncCheckIn,
  });
  errorRate.add(!ok);

  sleep(0.1);
}

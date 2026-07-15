import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * Hotspot #2 — leaderboard recompute + read under load.
 *
 * The leaderboard is the app's most-read surface and it is recomputed off the
 * check-in stream. This script runs TWO scenarios at once:
 *
 *   - `reads`   : a high, steady request rate against the `leaderboard` query
 *                 across ZONE / STATE / INDIA segments (the hot read path).
 *   - `recompute`: a trickle of check-ins that keep the underlying rows moving,
 *                 so reads are measured while ranks are actively recomputing
 *                 (worst case: cache churn, not a warm static page).
 *
 * Params (k6 env vars, `-e KEY=value`):
 *   BASE_URL     API origin            (default http://localhost:4000)
 *   TOKEN        Bearer access token   (required for a real run)
 *   SCOPE_KEY    ZONE scope key        (default koramangala)
 *   STATE_KEY    STATE scope key       (default KA)
 *   READ_RATE    leaderboard reads/s   (default 300)
 *   WRITE_RATE   recompute check-ins/s (default 10)
 *   GYM_CODE     gym check-in QR code  (default GYM-IRON-001)
 *   DURATION     scenario duration     (default 2m)
 */
const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const TOKEN = __ENV.TOKEN || "";
const SCOPE_KEY = __ENV.SCOPE_KEY || "koramangala";
const STATE_KEY = __ENV.STATE_KEY || "KA";
const READ_RATE = Number(__ENV.READ_RATE || 300);
const WRITE_RATE = Number(__ENV.WRITE_RATE || 10);
const GYM_CODE = __ENV.GYM_CODE || "GYM-IRON-001";
const DURATION = __ENV.DURATION || "2m";

const readErrors = new Rate("leaderboard_read_errors");
const writeErrors = new Rate("recompute_write_errors");
const readLatency = new Trend("leaderboard_read_ms", true);

export const options = {
  scenarios: {
    reads: {
      executor: "constant-arrival-rate",
      rate: READ_RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 50,
      maxVUs: 500,
      exec: "readLeaderboard",
    },
    recompute: {
      executor: "constant-arrival-rate",
      rate: WRITE_RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 100,
      exec: "triggerRecompute",
    },
  },
  thresholds: {
    // The read path is the SLO that matters: p95 < 300ms, p99 < 600ms.
    leaderboard_read_ms: ["p(95)<300", "p(99)<600"],
    leaderboard_read_errors: ["rate<0.01"],
    recompute_write_errors: ["rate<0.02"],
    http_req_failed: ["rate<0.01"],
  },
};

const headers = {
  "Content-Type": "application/json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const LEADERBOARD_QUERY = `
query Board($segment: LeaderboardSegment!, $scopeKey: String, $limit: Int) {
  leaderboard(segment: $segment, scopeKey: $scopeKey, limit: $limit) {
    segment
    scopeKey
    season
    page { userId displayName streak totalCheckIns position isSelf }
    self { userId position streak }
  }
}`;

const SYNC_MUTATION = `
mutation Sync($input: SyncCheckInInput!) {
  syncCheckIn(input: $input) { checkIn { id } }
}`;

// Rotate across segments so we exercise every index path, not just ZONE.
const SEGMENTS = [
  { segment: "ZONE", scopeKey: SCOPE_KEY },
  { segment: "STATE", scopeKey: STATE_KEY },
  { segment: "INDIA", scopeKey: null },
];

export function readLeaderboard() {
  const pick = SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)];
  const body = JSON.stringify({
    query: LEADERBOARD_QUERY,
    variables: { segment: pick.segment, scopeKey: pick.scopeKey, limit: 50 },
  });
  const res = http.post(`${BASE_URL}/graphql`, body, { headers });
  readLatency.add(res.timings.duration);

  let json;
  try {
    json = res.json();
  } catch (_e) {
    json = null;
  }
  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "no graphql errors": () => json !== null && !json.errors,
    "has leaderboard": () => json !== null && !!json.data && !!json.data.leaderboard,
  });
  readErrors.add(!ok);
}

export function triggerRecompute() {
  const body = JSON.stringify({
    query: SYNC_MUTATION,
    variables: {
      input: {
        gymCheckInCode: GYM_CODE,
        scannedAt: new Date().toISOString(),
        idempotencyKey: `k6-lb-${__VU}-${__ITER}-${Date.now()}`,
        acceptedTopUp: false,
      },
    },
  });
  const res = http.post(`${BASE_URL}/graphql`, body, { headers });
  let json;
  try {
    json = res.json();
  } catch (_e) {
    json = null;
  }
  const ok = check(res, {
    "recompute status 200": (r) => r.status === 200,
    "recompute no errors": () => json !== null && !json.errors,
  });
  writeErrors.add(!ok);
  sleep(0.2);
}

import { describe, it, expect } from "vitest";
import { retryDecision, backoffMs, MAX_ATTEMPTS } from "../retry.js";
import { streakRecompute, type HandlerDeps } from "../handlers.js";
import { Effect } from "effect";

describe("worker retry policy (DLX + backoff)", () => {
  it("retries until the final attempt, then parks", () => {
    expect(retryDecision(0)).toBe("RETRY");
    expect(retryDecision(MAX_ATTEMPTS - 2)).toBe("RETRY");
    expect(retryDecision(MAX_ATTEMPTS - 1)).toBe("PARK");
    expect(retryDecision(MAX_ATTEMPTS + 3)).toBe("PARK");
  });

  it("uses exponential backoff capped at 5 minutes", () => {
    expect(backoffMs(0)).toBe(5000);
    expect(backoffMs(1)).toBe(10000);
    expect(backoffMs(2)).toBe(20000);
    expect(backoffMs(20)).toBe(5 * 60 * 1000);
  });
});

describe("streakRecompute handler", () => {
  const deps: HandlerDeps = {
    log: () => {},
    loadCheckInInstants: async () => [
      new Date("2026-06-01T10:00:00Z"),
      new Date("2026-06-03T10:00:00Z"),
      new Date("2026-06-05T10:00:00Z"),
    ],
    now: () => new Date("2026-06-06T10:00:00Z"),
  };

  it("succeeds on a valid checkin.recorded message", async () => {
    const result = await Effect.runPromise(
      streakRecompute(deps)({
        checkInId: "c1",
        userId: "u1",
        gymId: "g1",
        zone: "z",
        scannedAt: "2026-06-05T10:00:00Z",
      }).pipe(Effect.either),
    );
    expect(result._tag).toBe("Right");
  });

  it("fails (→ retry/DLX) on a malformed message", async () => {
    const result = await Effect.runPromise(
      streakRecompute(deps)({ nope: true }).pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
  });
});

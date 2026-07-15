import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import type { UserId } from "@gymkartel/contracts";
import { ClockFixed } from "../../../shared/time/clock.js";
import {
  LedgerService,
  LedgerServiceLive,
  LedgerRepoMemory,
} from "../application/ledger-service.js";

const layer = LedgerServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      ClockFixed(new Date("2026-06-10T10:00:00.000Z")),
      LedgerRepoMemory,
    ),
  ),
);

describe("LedgerService (parse + PR flags)", () => {
  it("logs parsed entries and flags a personal record on a heavier lift", async () => {
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const ledger = yield* LedgerService;
        yield* ledger.log("u1" as UserId, "bench 3x8 60kg");
        const second = yield* ledger.log("u1" as UserId, "bench 3x5 80kg");
        return second;
      }).pipe(Effect.provide(layer)),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.isPR).toBe(true);
  });

  it("keeps history filterable by exercise", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const ledger = yield* LedgerService;
        yield* ledger.log("u2" as UserId, "squat 5x5 100kg, run 5km");
        return yield* ledger.history("u2" as UserId, "squat");
      }).pipe(Effect.provide(layer)),
    );
    expect(rows.every((r) => "exercise" in r.entry && r.entry.exercise === "squat")).toBe(
      true,
    );
  });
});

import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import type {
  Gym,
  GymId,
  IndianState,
  Pass,
  PassId,
  Tier,
  UserId,
  Zone,
} from "@gymkartel/contracts";
import { ConfigTest } from "../../../shared/config/config.js";
import { ClockFixed } from "../../../shared/time/clock.js";
import { LoggerTest } from "../../../shared/logger/logger.js";
import {
  PaymentsService,
  PaymentsServiceLive,
} from "../../payments/application/payments-service.js";
import {
  OrderRepoMemory,
  PaymentGatewayMemory,
} from "../../payments/infrastructure/in-memory.js";
import { GymRepoMemory } from "../../gyms/infrastructure/in-memory.js";
import { PassRepoMemory } from "../../passes/infrastructure/in-memory.js";
import {
  CheckInServiceLive,
  CheckInService,
} from "../application/checkin-service.js";
import {
  CheckInEventRecorder,
  CheckInEventsMemory,
  CheckInRepoMemory,
} from "../infrastructure/in-memory.js";
import { PassRepo } from "../../passes/application/pass-repo.js";

const now = new Date("2026-06-10T09:00:00.000Z");

const gym = (id: string, tier: Tier, code: string): Gym => ({
  schemaVersion: 1,
  id: id as GymId,
  name: `Gym ${id}`,
  tier,
  zone: "koramangala" as Zone,
  state: "KA" as IndianState,
  location: { type: "Point", coordinates: [77.6, 12.9] },
  address: "somewhere",
  amenities: [],
  photoUrls: [],
  checkInCode: code,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

const pass = (userId: string, tier: Tier): Pass => ({
  schemaVersion: 1,
  id: `pass_${userId}` as PassId,
  userId: userId as UserId,
  tier,
  pack: "FIFTEEN_DAY",
  daysTotal: 15,
  daysUsed: 0,
  bonusDays: 0,
  purchasedAt: now.toISOString(),
  validUntil: new Date(now.getTime() + 20 * 86400000).toISOString(),
  status: "ACTIVE",
  orderId: "order_seed",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

const buildLayer = (gyms: Gym[], passes: Pass[], recorder: CheckInEventRecorder) => {
  const clock = ClockFixed(now);
  const payments = PaymentsServiceLive.pipe(
    Layer.provide(Layer.mergeAll(PaymentGatewayMemory, OrderRepoMemory(), clock)),
  );
  const passRepo = PassRepoMemory(passes);
  const deps = Layer.mergeAll(
    ConfigTest(),
    clock,
    LoggerTest,
    GymRepoMemory(gyms),
    passRepo,
    payments,
    CheckInRepoMemory(),
    CheckInEventsMemory(recorder),
  );
  return {
    layer: CheckInServiceLive.pipe(Layer.provide(deps)),
    passRepo: Layer.mergeAll(passRepo),
  };
};

const input = (code: string, key: string, accepted = false) => ({
  gymCheckInCode: code,
  scannedAt: now.toISOString(),
  idempotencyKey: key,
  acceptedTopUp: accepted,
});

describe("CheckInService (heartbeat, idempotent)", () => {
  it("scans free when pass tier >= gym tier and consumes one day", async () => {
    const recorder = new CheckInEventRecorder();
    const { layer } = buildLayer([gym("g1", "BASIC", "QR1")], [pass("u1", "STANDARD")], recorder);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CheckInService;
        return yield* svc.syncCheckIn("u1" as UserId, input("QR1", "key-free-1"));
      }).pipe(Effect.provide(layer)),
    );
    expect(result.gymTier).toBe("BASIC");
    expect(result.topUp).toBeUndefined();
    expect(recorder.events).toHaveLength(1);
  });

  it("is idempotent: replaying the same idempotencyKey returns the same check-in", async () => {
    const recorder = new CheckInEventRecorder();
    const { layer } = buildLayer([gym("g1", "BASIC", "QR1")], [pass("u1", "STANDARD")], recorder);
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CheckInService;
        const a = yield* svc.syncCheckIn("u1" as UserId, input("QR1", "dupe-key-1"));
        const b = yield* svc.syncCheckIn("u1" as UserId, input("QR1", "dupe-key-1"));
        return { a, b };
      }).pipe(Effect.provide(layer)),
    );
    expect(out.a.id).toBe(out.b.id);
    expect(recorder.events).toHaveLength(1);
  });

  it("returns TopUpRequired (never a wall) with a Razorpay order when gym is above tier", async () => {
    const recorder = new CheckInEventRecorder();
    const { layer } = buildLayer([gym("g2", "PREMIUM", "QR2")], [pass("u1", "BASIC")], recorder);
    const res = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CheckInService;
        return yield* svc
          .syncCheckIn("u1" as UserId, input("QR2", "topup-key-1", false))
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );
    expect(res._tag).toBe("Left");
    if (res._tag === "Left" && res.left._tag === "TopUpRequired") {
      expect(res.left.amountPaise).toBe(9900);
      expect(res.left.razorpayOrderId).toMatch(/^order_test_/);
    } else {
      throw new Error(`expected TopUpRequired, got ${res._tag}`);
    }
  });

  it("fails with NoActivePass when the user has none", async () => {
    const recorder = new CheckInEventRecorder();
    const { layer } = buildLayer([gym("g1", "BASIC", "QR1")], [], recorder);
    const res = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CheckInService;
        return yield* svc
          .syncCheckIn("nobody" as UserId, input("QR1", "key-8chars"))
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );
    expect(res._tag).toBe("Left");
    if (res._tag === "Left") expect(res.left._tag).toBe("NoActivePass");
  });

  it("fails with GymNotFound for an unknown QR code", async () => {
    const recorder = new CheckInEventRecorder();
    const { layer } = buildLayer([gym("g1", "BASIC", "QR1")], [pass("u1", "BASIC")], recorder);
    const res = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CheckInService;
        return yield* svc
          .syncCheckIn("u1" as UserId, input("NOPE", "key-8chars"))
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );
    expect(res._tag).toBe("Left");
    if (res._tag === "Left") expect(res.left._tag).toBe("GymNotFound");
  });
});

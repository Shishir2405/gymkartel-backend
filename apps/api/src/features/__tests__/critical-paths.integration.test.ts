import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { MongoClient, type Db } from "mongodb";
import type { StartedMongoDBContainer } from "@testcontainers/mongodb";
import type { Gym, GymId, Pass, PassId, UserId, Zone } from "@gymkartel/contracts";
import { passPrice } from "@gymkartel/contracts";

import { ConfigLive } from "../../shared/config/config.js";
import { ClockLive } from "../../shared/time/clock.js";
import { LoggerLive } from "../../shared/logger/logger.js";
import { MongoLive } from "../../shared/db/mongo.js";
import { COLLECTION_INDEXES } from "../../shared/db/indexes.js";

import { GymRepoMongo } from "../gyms/infrastructure/mongo.js";
import { PassRepo } from "../passes/application/pass-repo.js";
import { PassRepoMongo } from "../passes/infrastructure/mongo.js";
import { CheckInRepoMongo } from "../check-in/infrastructure/mongo.js";
import { CheckInEventsMemory, CheckInEventRecorder } from "../check-in/infrastructure/in-memory.js";
import { OrderRepoMongo } from "../payments/infrastructure/mongo.js";
import { PaymentGatewayMemory } from "../payments/infrastructure/in-memory.js";
import { PaymentsService, PaymentsServiceLive } from "../payments/application/payments-service.js";
import { PassesService, PassesServiceLive } from "../passes/application/passes-service.js";
import { CheckInService, CheckInServiceLive } from "../check-in/application/checkin-service.js";
import type { RazorpayWebhook } from "../payments/domain/webhook.js";

const ENABLED = !!process.env.INTEGRATION;

const ZONE = "koramangala" as Zone;

const buildRuntime = (recorder: CheckInEventRecorder) => {
  const drivers = MongoLive.pipe(Layer.provide(ConfigLive));
  const repos = Layer.mergeAll(
    GymRepoMongo,
    PassRepoMongo,
    CheckInRepoMongo,
    OrderRepoMongo,
  ).pipe(Layer.provide(drivers));
  const infra = Layer.mergeAll(
    ClockLive,
    LoggerLive,
    repos,
    PaymentGatewayMemory,
    CheckInEventsMemory(recorder),
  ).pipe(Layer.provideMerge(ConfigLive));
  const payments = PaymentsServiceLive.pipe(Layer.provide(infra));
  const tier1 = Layer.merge(infra, payments);
  const passes = PassesServiceLive.pipe(Layer.provide(tier1));
  const checkin = CheckInServiceLive.pipe(Layer.provide(tier1));
  return ManagedRuntime.make(Layer.mergeAll(tier1, passes, checkin));
};

const gymDoc = (over: Partial<Gym> = {}): Gym =>
  ({
    schemaVersion: 1,
    id: "gym_it_std" as GymId,
    name: "Integration Iron",
    tier: "STANDARD",
    zone: ZONE,
    state: "KA",
    location: { type: "Point", coordinates: [77.62, 12.93] },
    address: "Test Rd",
    amenities: ["FREE_WEIGHTS"],
    photoUrls: [],
    checkInCode: "GYM-IT-001",
    rating: 4.5,
    liveBusyFraction: 0.3,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  }) as Gym;

const passDoc = (over: Partial<Pass> = {}): Pass =>
  ({
    schemaVersion: 1,
    id: "pass_it_1" as PassId,
    userId: "user_it_1" as UserId,
    tier: "STANDARD",
    pack: "FIFTEEN_DAY",
    daysTotal: 15,
    daysUsed: 0,
    bonusDays: 0,
    purchasedAt: "2026-06-01T00:00:00.000Z",
    validUntil: "2099-01-01T00:00:00.000Z",
    status: "ACTIVE",
    orderId: "order_it_seed_1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  }) as Pass;

describe.skipIf(!ENABLED)("critical paths — Testcontainers Mongo", () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;
  let db: Db;
  let runtime: ReturnType<typeof buildRuntime>;
  const recorder = new CheckInEventRecorder();

  beforeAll(async () => {
    const { MongoDBContainer } = await import("@testcontainers/mongodb");
    container = await new MongoDBContainer("mongo:7").start();

    const uri = container.getConnectionString();
    process.env.MONGO_URI = uri;
    process.env.MONGO_DB = "gymkartel_it";
    process.env.PERSISTENCE = "mongo";

    client = await MongoClient.connect(uri, { directConnection: true });
    db = client.db("gymkartel_it");

    for (const [collection, indexes] of Object.entries(COLLECTION_INDEXES)) {
      await db.collection(collection).createIndexes(indexes);
    }

    runtime = buildRuntime(recorder);
  }, 180_000);

  afterAll(async () => {
    await runtime?.dispose();
    await client?.close();
    await container?.stop();
    delete process.env.PERSISTENCE;
  });

  describe("Mongo adapter round-trip (Zod boundary + indexes)", () => {
    it("inserts and reads back a validated pass through the adapter", async () => {
      const pass = passDoc({ id: "pass_rt_1" as PassId, orderId: "order_rt_1" });
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const repo = yield* PassRepo;
          yield* repo.insert(pass);
          const byId = yield* repo.getById(pass.id);
          const byOrder = yield* repo.findByOrderId(pass.orderId);
          return { byId, byOrder };
        }),
      );
      expect(result.byId?.id).toBe("pass_rt_1");
      expect(result.byOrder?.orderId).toBe("order_rt_1");
    });

    it("maps a malformed stored document to a DatabaseError (never leaks)", async () => {
      await db.collection("passes").insertOne({ id: "pass_bad", status: "ACTIVE" });
      const exit = await runtime.runPromiseExit(
        Effect.gen(function* () {
          const repo = yield* PassRepo;
          return yield* repo.getById("pass_bad" as PassId);
        }),
      );
      expect(exit._tag).toBe("Failure");
    });

    it("applied the called-out indexes", async () => {
      const checkInIx = (await db.collection("checkIns").indexes()).map((i) => i.name);
      const passIx = (await db.collection("passes").indexes()).map((i) => i.name);
      expect(checkInIx).toContain("uniq_idempotency");
      expect(checkInIx).toContain("user_gym_scannedAt");
      expect(passIx).toContain("uniq_order");
    });
  });

  describe("check-in idempotency + offline replay", () => {
    const userId = "user_it_ci" as UserId;

    beforeAll(async () => {
      await db.collection("gyms").insertOne(gymDoc());
      await db.collection("passes").insertOne(
        passDoc({ id: "pass_ci_1" as PassId, userId, orderId: "order_ci_seed" }),
      );
    });

    const syncInput = (idempotencyKey: string) => ({
      gymCheckInCode: "GYM-IT-001",
      scannedAt: "2026-06-05T10:00:00.000Z",
      idempotencyKey,
    });

    it("a duplicate idempotencyKey collapses to a single stored check-in", async () => {
      const key = "offline-key-0000001";
      const first = await runtime.runPromise(
        Effect.gen(function* () {
          const svc = yield* CheckInService;
          return yield* svc.syncCheckIn(userId, syncInput(key));
        }),
      );
      const replay = await runtime.runPromise(
        Effect.gen(function* () {
          const svc = yield* CheckInService;
          return yield* svc.syncCheckIn(userId, syncInput(key));
        }),
      );
      expect(replay.id).toBe(first.id);
      const count = await db.collection("checkIns").countDocuments({ idempotencyKey: key });
      expect(count).toBe(1);
    });

    it("concurrent replays of the same key still write exactly one row", async () => {
      const key = "offline-key-0000002";
      const both = await Promise.all([
        runtime.runPromise(
          Effect.gen(function* () {
            const svc = yield* CheckInService;
            return yield* svc.syncCheckIn(userId, syncInput(key));
          }),
        ),
        runtime.runPromise(
          Effect.gen(function* () {
            const svc = yield* CheckInService;
            return yield* svc.syncCheckIn(userId, syncInput(key));
          }),
        ),
      ]);
      expect(both[0].id).toBe(both[1].id);
      const count = await db.collection("checkIns").countDocuments({ idempotencyKey: key });
      expect(count).toBe(1);
    });
  });

  describe("pass purchase + Razorpay webhook reconciliation", () => {
    const userId = "user_it_pay" as UserId;

    const capturedWebhook = (orderId: string, amountPaise: number): RazorpayWebhook => ({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_${orderId}`,
            order_id: orderId,
            amount: amountPaise,
            status: "captured",
            method: "upi",
          },
        },
      },
    });

    it("activates exactly one pass and a webhook replay never double-activates", async () => {
      const order = await runtime.runPromise(
        Effect.gen(function* () {
          const passes = yield* PassesService;
          return yield* passes.createOrder({ userId, tier: "STANDARD", pack: "SEVEN_DAY" });
        }),
      );
      expect(order.amountPaise).toBe(passPrice("STANDARD", "SEVEN_DAY"));

      const body = JSON.stringify(capturedWebhook(order.orderId, order.amountPaise));

      const activate = () =>
        runtime.runPromise(
          Effect.gen(function* () {
            const payments = yield* PaymentsService;
            const outcome = yield* payments.reconcileWebhook(body, "valid");
            if (outcome.reconciliation.kind !== "ACTIVATE") {
              return { kind: outcome.reconciliation.kind, passId: null as string | null };
            }
            const passes = yield* PassesService;
            const pass = yield* passes.activateFromOrder(outcome.reconciliation.intent);
            return { kind: "ACTIVATE" as const, passId: pass.id };
          }),
        );

      const first = await activate();
      expect(first.kind).toBe("ACTIVATE");

      const replay = await activate();
      expect(replay.kind).toBe("NOOP");

      const passCount = await db
        .collection("passes")
        .countDocuments({ orderId: order.orderId });
      expect(passCount).toBe(1);
    });
  });
});

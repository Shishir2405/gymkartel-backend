import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Effect, Layer } from "effect";
import { MongoClient } from "mongodb";
import { ConfigLive } from "../../shared/config/config.js";
import { MongoLive } from "../../shared/db/mongo.js";
import { PassRepo } from "../passes/application/pass-repo.js";
import { PassRepoMongo } from "../passes/infrastructure/mongo.js";
import type { Pass } from "@gymkartel/contracts";

/**
 * Live-Mongo integration test. SKIPPED unless `INTEGRATION=1` is set, so the
 * default `pnpm -r test` never needs Docker. Run against the docker-compose
 * replica set:
 *
 *   docker compose up -d
 *   INTEGRATION=1 MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" \
 *     pnpm --filter @gymkartel/api test
 *
 * Testcontainers could stand this up per-run instead; that dependency is left
 * out so the default install stays lean.
 */
const ENABLED = process.env.INTEGRATION === "1";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB ?? "gymkartel_test";
const COLLECTION = "passes";

const pass: Pass = {
  schemaVersion: 1,
  id: "pass_integration_1",
  userId: "user_integration_1",
  tier: "BASIC",
  pack: "SEVEN_DAY",
  daysTotal: 7,
  daysUsed: 0,
  bonusDays: 0,
  purchasedAt: "2026-06-01T00:00:00.000Z",
  validUntil: "2026-06-20T00:00:00.000Z",
  status: "ACTIVE",
  orderId: "order_integration_1",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
} as Pass;

describe.skipIf(!ENABLED)("PassRepoMongo against live Mongo", () => {
  let client: MongoClient;

  beforeAll(async () => {
    process.env.MONGO_DB = MONGO_DB;
    client = await MongoClient.connect(MONGO_URI);
    await client.db(MONGO_DB).collection(COLLECTION).deleteMany({ id: pass.id });
  });

  afterAll(async () => {
    if (client) {
      await client.db(MONGO_DB).collection(COLLECTION).deleteMany({ id: pass.id });
      await client.close();
    }
  });

  it("inserts and reads back a validated pass", async () => {
    const layer = PassRepoMongo.pipe(Layer.provide(MongoLive), Layer.provide(ConfigLive));
    const program = Effect.gen(function* () {
      const repo = yield* PassRepo;
      yield* repo.insert(pass);
      const found = yield* repo.getById(pass.id);
      const byOrder = yield* repo.findByOrderId(pass.orderId);
      return { found, byOrder };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(layer), Effect.scoped),
    );
    expect(result.found?.id).toBe(pass.id);
    expect(result.byOrder?.orderId).toBe(pass.orderId);
  });
});

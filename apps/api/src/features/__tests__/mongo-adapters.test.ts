import { describe, it, expect } from "vitest";
import { Effect, Exit, Layer } from "effect";
import type { Collection, Db, Document } from "mongodb";
import { Mongo, type MongoApi } from "../../shared/db/mongo.js";
import { PassRepo } from "../passes/application/pass-repo.js";
import { PassRepoMongo } from "../passes/infrastructure/mongo.js";
import { LeaderboardRepo } from "../leaderboards/application/leaderboard-service.js";
import { LeaderboardRepoMongo } from "../leaderboards/infrastructure/mongo.js";
import { FeatureFlags } from "../feature-flags/feature-flags.js";
import { FeatureFlagsMongo } from "../feature-flags/mongo.js";
import type { Pass } from "@gymkartel/contracts";

type Row = Record<string, unknown>;

const shallowMatch = (row: Row, filter: Row): boolean =>
  Object.entries(filter).every(([k, v]) => row[k] === v);

const makeCursor = (rows: Row[]) => {
  const cursor = {
    sort: () => cursor,
    limit: (n: number) => makeCursor(rows.slice(0, n)),
    toArray: async () => rows,
    next: async () => rows[0] ?? null,
  };
  return cursor;
};

const fakeMongo = (seed: Record<string, Row[]>): Layer.Layer<Mongo> => {
  const store: Record<string, Row[]> = { ...seed };
  const api: MongoApi = {
    db: {} as Db,
    collection: <T extends Document = Document>(name: string) => {
      const rows = (store[name] ??= []);
      return {
        findOne: async (filter: Row = {}) =>
          rows.find((r) => shallowMatch(r, filter)) ?? null,
        find: (filter: Row = {}) =>
          makeCursor(rows.filter((r) => shallowMatch(r, filter))),
        insertOne: async (doc: Row) => {
          rows.push(doc);
          return { acknowledged: true, insertedId: doc.id };
        },
        replaceOne: async () => ({ acknowledged: true, modifiedCount: 1 }),
        updateOne: async () => ({ acknowledged: true, matchedCount: 1 }),
      } as unknown as Collection<T>;
    },
  };
  return Layer.succeed(Mongo, api);
};

const runExit = <A, E>(program: Effect.Effect<A, E, never>) =>
  Effect.runPromiseExit(program);

const validPass: Pass = {
  schemaVersion: 1,
  id: "pass_1",
  userId: "user_1",
  tier: "BASIC",
  pack: "SEVEN_DAY",
  daysTotal: 7,
  daysUsed: 0,
  bonusDays: 0,
  purchasedAt: "2026-06-01T00:00:00.000Z",
  validUntil: "2026-06-20T00:00:00.000Z",
  status: "ACTIVE",
  orderId: "order_1",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
} as Pass;

describe("Mongo adapters — Zod boundary (Docker-free)", () => {
  it("PassRepoMongo.getById parses a valid document", async () => {
    const layer = Layer.provide(PassRepoMongo, fakeMongo({ passes: [{ ...validPass }] }));
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PassRepo;
        return yield* repo.getById(validPass.id);
      }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value?.id).toBe("pass_1");
  });

  it("PassRepoMongo.getById fails with DatabaseError on a malformed document", async () => {
    const bad = { id: "pass_bad", status: "ACTIVE" };
    const layer = Layer.provide(PassRepoMongo, fakeMongo({ passes: [bad] }));
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PassRepo;
        return yield* repo.getById("pass_bad" as Pass["id"]);
      }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const err = exit.cause.toString();
      expect(err).toContain("DatabaseError");
    }
  });

  it("PassRepoMongo.insert validates BEFORE touching the driver", async () => {
    const layer = Layer.provide(PassRepoMongo, fakeMongo({ passes: [] }));
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PassRepo;
        return yield* repo.insert({ id: "x" } as unknown as Pass);
      }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("LeaderboardRepoMongo.rows parses valid stored rows", async () => {
    const row = {
      segment: "ZONE",
      scopeKey: "z1",
      season: "2026-06",
      userId: "user_1",
      displayName: "Ana",
      streak: 3,
      totalCheckIns: 9,
    };
    const layer = Layer.provide(
      LeaderboardRepoMongo,
      fakeMongo({ leaderboardEntries: [row] }),
    );
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* LeaderboardRepo;
        return yield* repo.rows("ZONE", "z1", "2026-06");
      }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toHaveLength(1);
      expect(exit.value[0]?.streak).toBe(3);
    }
  });

  it("FeatureFlagsMongo.isEnabled returns the stored value and the fallback", async () => {
    const layer = Layer.provide(
      FeatureFlagsMongo,
      fakeMongo({ featureFlags: [{ key: "beta", enabled: true }] }),
    );
    const exit = await runExit(
      Effect.gen(function* () {
        const flags = yield* FeatureFlags;
        const on = yield* flags.isEnabled("beta");
        const missing = yield* flags.isEnabled("nope", true);
        return { on, missing };
      }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.on).toBe(true);
      expect(exit.value.missing).toBe(true);
    }
  });
});

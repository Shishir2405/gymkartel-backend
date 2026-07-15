import { Effect, Layer } from "effect";
import { Pass, type PassId, type UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { daysLeft } from "../domain/pass-rules.js";
import { PassRepo } from "../application/pass-repo.js";

/**
 * Mongo-backed pass repository. Mirrors the canonical onboarding adapter: every
 * document is validated against the contract `Pass` Zod schema at this boundary
 * on both read and write (honoring `schemaVersion`), and driver failures are
 * mapped to the tagged `DatabaseError`.
 */
const COLLECTION = "passes";

const parsePass = (doc: unknown): Effect.Effect<Pass, DatabaseError> => {
  const r = Pass.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "passes.parse", cause: r.error }));
};

export const PassRepoMongo: Layer.Layer<PassRepo, never, Mongo> = Layer.effect(
  PassRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<Pass>(COLLECTION);
    return {
      getById: (id: PassId) =>
        mongoOp("passes.getById", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) => (doc ? parsePass(doc) : Effect.succeed(null))),
        ),
      latestForUser: (userId: UserId) =>
        mongoOp("passes.latestForUser", () =>
          col.find({ userId }).sort({ purchasedAt: -1 }).limit(1).next(),
        ).pipe(Effect.flatMap((doc) => (doc ? parsePass(doc) : Effect.succeed(null)))),
      // Status-only DB filter; the in-window/expiry decision stays in the
      // service (injected clock) — but we still drop exhausted passes here so
      // the semantics match the in-memory adapter.
      activeForUser: (userId: UserId) =>
        mongoOp("passes.activeForUser", () =>
          col.find({ userId, status: "ACTIVE" }).sort({ purchasedAt: -1 }).toArray(),
        ).pipe(
          Effect.flatMap((docs) =>
            Effect.forEach(docs, parsePass).pipe(
              Effect.map((rows) => rows.find((p) => daysLeft(p) > 0) ?? null),
            ),
          ),
        ),
      insert: (pass) =>
        parsePass(pass).pipe(
          Effect.flatMap((valid) =>
            mongoOp("passes.insert", () => col.insertOne(valid)).pipe(Effect.as(valid)),
          ),
        ),
      update: (id, patch) =>
        mongoOp("passes.findForUpdate", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) =>
            doc
              ? parsePass(doc).pipe(
                  Effect.map(patch),
                  Effect.flatMap((next) =>
                    mongoOp("passes.update", () => col.replaceOne({ id }, next)).pipe(
                      Effect.as(next),
                    ),
                  ),
                )
              : Effect.succeed(null),
          ),
        ),
      findByOrderId: (orderId: string) =>
        mongoOp("passes.findByOrderId", () => col.findOne({ orderId })).pipe(
          Effect.flatMap((doc) => (doc ? parsePass(doc) : Effect.succeed(null))),
        ),
    };
  }),
);

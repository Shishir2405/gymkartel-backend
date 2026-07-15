import { Effect, Layer } from "effect";
import { CheckIn, type UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { istDayNumber } from "../../streaks-ranks/domain/ist.js";
import { CheckInRepo } from "../application/ports.js";

/**
 * Mongo-backed check-in repository. The `checkIns` collection is the heartbeat
 * aggregate — every read/write is Zod-validated against the contract `CheckIn`
 * schema. Reads lean on the two indexes declared in `shared/db/indexes.ts`:
 *   - { userId:1, gymId:1, scannedAt:-1 } for the recent/history path
 *   - { idempotencyKey:1 } unique for offline-scan dedup
 */
const COLLECTION = "checkIns";

const parseCheckIn = (doc: unknown): Effect.Effect<CheckIn, DatabaseError> => {
  const r = CheckIn.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "checkIns.parse", cause: r.error }));
};

export const CheckInRepoMongo: Layer.Layer<CheckInRepo, never, Mongo> = Layer.effect(
  CheckInRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<CheckIn>(COLLECTION);
    return {
      findByIdempotencyKey: (key: string) =>
        mongoOp("checkIns.findByIdempotencyKey", () =>
          col.findOne({ idempotencyKey: key }),
        ).pipe(
          Effect.flatMap((doc) => (doc ? parseCheckIn(doc) : Effect.succeed(null))),
        ),
      // IST day bucketing is timezone maths the driver can't express, so we
      // resolve the day per-document in app — identical to the memory adapter.
      existsForUserOnDay: (userId: UserId, dayNumber: number) =>
        mongoOp("checkIns.existsForUserOnDay", () =>
          col.find({ userId }).toArray(),
        ).pipe(
          Effect.flatMap((docs) =>
            Effect.forEach(docs, parseCheckIn).pipe(
              Effect.map((rows) =>
                rows.some((c) => istDayNumber(new Date(c.scannedAt)) === dayNumber),
              ),
            ),
          ),
        ),
      insert: (checkIn) =>
        parseCheckIn(checkIn).pipe(
          Effect.flatMap((valid) =>
            mongoOp("checkIns.insert", () => col.insertOne(valid)).pipe(
              Effect.as(valid),
            ),
          ),
        ),
      recentForUser: (userId: UserId, limit: number) =>
        mongoOp("checkIns.recentForUser", () =>
          col.find({ userId }).sort({ scannedAt: -1 }).limit(limit).toArray(),
        ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseCheckIn))),
      allInstantsForUser: (userId: UserId) =>
        mongoOp("checkIns.allInstantsForUser", () =>
          col.find({ userId }).sort({ scannedAt: -1 }).toArray(),
        ).pipe(
          Effect.flatMap((docs) =>
            Effect.forEach(docs, parseCheckIn).pipe(
              Effect.map((rows) => rows.map((c) => new Date(c.scannedAt))),
            ),
          ),
        ),
    };
  }),
);

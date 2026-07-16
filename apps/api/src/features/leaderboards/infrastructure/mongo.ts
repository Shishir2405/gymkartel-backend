import { Effect, Layer } from "effect";
import { z } from "zod";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import {
  LeaderboardRepo,
  type StoredLeaderboardRow,
} from "../application/leaderboard-service.js";

const COLLECTION = "leaderboardEntries";

const StoredRowDoc = z.object({
  segment: z.enum(["ZONE", "STATE", "INDIA"]),
  scopeKey: z.string().min(1),
  season: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string(),
  streak: z.number().int().nonnegative(),
  totalCheckIns: z.number().int().nonnegative(),
});

const parseRow = (doc: unknown): Effect.Effect<StoredLeaderboardRow, DatabaseError> => {
  const r = StoredRowDoc.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(
        new DatabaseError({ op: "leaderboardEntries.parse", cause: r.error }),
      );
};

export const LeaderboardRepoMongo: Layer.Layer<LeaderboardRepo, never, Mongo> =
  Layer.effect(
    LeaderboardRepo,
    Effect.gen(function* () {
      const mongo = yield* Mongo;
      const col = mongo.collection<StoredLeaderboardRow>(COLLECTION);
      return {
        upsert: (row) =>
          parseRow(row).pipe(
            Effect.flatMap((valid) =>
              mongoOp("leaderboardEntries.upsert", () =>
                col.replaceOne(
                  {
                    segment: valid.segment,
                    scopeKey: valid.scopeKey,
                    season: valid.season,
                    userId: valid.userId,
                  },
                  valid,
                  { upsert: true },
                ),
              ).pipe(Effect.asVoid),
            ),
          ),
        rows: (segment, scopeKey, season) =>
          mongoOp("leaderboardEntries.rows", () =>
            col
              .find({ segment, scopeKey, season })
              .sort({ streak: -1 })
              .toArray(),
          ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseRow))),
      };
    }),
  );

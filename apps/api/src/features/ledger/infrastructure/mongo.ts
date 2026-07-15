import { Effect, Layer } from "effect";
import { z } from "zod";
import { CoachId, UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { LedgerRepo, type LoggedEntry } from "../application/ledger-service.js";

/**
 * Mongo-backed workout ledger (`ledgerEntries` collection). Entries are
 * feature-internal (the parsed `WorkoutEntry` union), validated with a local
 * Zod schema mirroring the parser's discriminated union. PR lookups use the
 * `user_exercise` index in `shared/db/indexes.ts`.
 */
const COLLECTION = "ledgerEntries";

const StrengthEntryDoc = z.object({
  kind: z.literal("STRENGTH"),
  exercise: z.string(),
  sets: z.number(),
  reps: z.number(),
  weightKg: z.number().nullable(),
  uncertain: z.boolean(),
  note: z.string().optional(),
  raw: z.string(),
});
const CardioEntryDoc = z.object({
  kind: z.literal("CARDIO"),
  exercise: z.string(),
  distanceKm: z.number().nullable(),
  durationMin: z.number().nullable(),
  uncertain: z.boolean(),
  note: z.string().optional(),
  raw: z.string(),
});
const UnknownEntryDoc = z.object({
  kind: z.literal("UNKNOWN"),
  uncertain: z.literal(true),
  note: z.string(),
  raw: z.string(),
});
const WorkoutEntryDoc = z.discriminatedUnion("kind", [
  StrengthEntryDoc,
  CardioEntryDoc,
  UnknownEntryDoc,
]);

const LoggedEntryDoc = z.object({
  id: z.string().min(1),
  userId: UserId,
  entry: WorkoutEntryDoc,
  isPR: z.boolean(),
  coachId: CoachId.nullable(),
  loggedAt: z.string().min(1),
});

const parseEntry = (doc: unknown): Effect.Effect<LoggedEntry, DatabaseError> => {
  const r = LoggedEntryDoc.safeParse(doc);
  // `z.optional()` widens `note` to `string | undefined`; under
  // exactOptionalPropertyTypes that is not assignable to WorkoutEntry's exact
  // optional `note?: string`. The validated shape is structurally identical, so
  // narrow it back with a cast (not `any`).
  return r.success
    ? Effect.succeed(r.data as LoggedEntry)
    : Effect.fail(new DatabaseError({ op: "ledgerEntries.parse", cause: r.error }));
};

export const LedgerRepoMongo: Layer.Layer<LedgerRepo, never, Mongo> = Layer.effect(
  LedgerRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<LoggedEntry>(COLLECTION);
    return {
      append: (entry) =>
        parseEntry(entry).pipe(
          Effect.flatMap((valid) =>
            mongoOp("ledgerEntries.append", () => col.insertOne(valid)).pipe(
              Effect.as(valid),
            ),
          ),
        ),
      forUser: (userId) =>
        mongoOp("ledgerEntries.forUser", () =>
          col.find({ userId }).sort({ loggedAt: -1 }).toArray(),
        ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseEntry))),
      bestWeight: (userId, exercise) =>
        mongoOp("ledgerEntries.bestWeight", () =>
          col
            .find({ userId, "entry.kind": "STRENGTH", "entry.exercise": exercise })
            .toArray(),
        ).pipe(
          Effect.flatMap((docs) =>
            Effect.forEach(docs, parseEntry).pipe(
              Effect.map((rows) => {
                let best: number | null = null;
                for (const r of rows) {
                  if (
                    r.entry.kind === "STRENGTH" &&
                    r.entry.weightKg !== null &&
                    (best === null || r.entry.weightKg > best)
                  ) {
                    best = r.entry.weightKg;
                  }
                }
                return best;
              }),
            ),
          ),
        ),
    };
  }),
);

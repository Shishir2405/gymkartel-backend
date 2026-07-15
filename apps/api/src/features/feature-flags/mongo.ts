import { Effect, Layer } from "effect";
import { z } from "zod";
import { Mongo, mongoOp } from "../../shared/db/mongo.js";
import { DatabaseError } from "../../shared/errors/errors.js";
import { FeatureFlags, type FeatureFlagKey } from "./feature-flags.js";

/**
 * Mongo-backed feature flags (`featureFlags` collection, unique on `key`).
 * Flags are feature-internal, validated with a local Zod schema. Reads hit the
 * `uniq_flag` index. (A production build layers a short-TTL Redis cache in front
 * of this; the port is identical either way.)
 */
const COLLECTION = "featureFlags";

const FlagDoc = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
});

const parseFlag = (doc: unknown): Effect.Effect<FeatureFlagKey, DatabaseError> => {
  const r = FlagDoc.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "featureFlags.parse", cause: r.error }));
};

export const FeatureFlagsMongo: Layer.Layer<FeatureFlags, never, Mongo> = Layer.effect(
  FeatureFlags,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<FeatureFlagKey>(COLLECTION);
    return {
      isEnabled: (key, fallback = false) =>
        mongoOp("featureFlags.isEnabled", () => col.findOne({ key })).pipe(
          Effect.flatMap((doc) =>
            doc ? parseFlag(doc).pipe(Effect.map((f) => f.enabled)) : Effect.succeed(fallback),
          ),
        ),
      set: (key, enabled) =>
        mongoOp("featureFlags.set", () =>
          col.updateOne({ key }, { $set: { enabled } }, { upsert: true }),
        ).pipe(Effect.asVoid),
      all: () =>
        mongoOp("featureFlags.all", () => col.find({}).toArray()).pipe(
          Effect.flatMap((docs) => Effect.forEach(docs, parseFlag)),
        ),
    };
  }),
);

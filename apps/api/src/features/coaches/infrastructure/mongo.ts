import { Effect, Layer } from "effect";
import { Coach, type CoachId } from "@gymkartel/contracts";
import type { Filter } from "mongodb";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { CoachRepo, type CoachFilter } from "../application/coach-repo.js";

/**
 * Mongo-backed coach repository. Reads/writes are Zod-validated against the
 * contract `Coach` schema. The `verified`/price filters push down to Mongo (the
 * `verified_rating` index); specialty substring + the femaleOnly convention are
 * applied in app to mirror the in-memory adapter exactly.
 */
const COLLECTION = "coaches";

/** femaleOnly filters on a specialty marker — same convention as in-memory. */
const matchesFemaleOnly = (coach: Coach): boolean =>
  coach.specialties.some((s) => /female|women/i.test(s));

const parseCoach = (doc: unknown): Effect.Effect<Coach, DatabaseError> => {
  const r = Coach.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "coaches.parse", cause: r.error }));
};

export const CoachRepoMongo: Layer.Layer<CoachRepo, never, Mongo> = Layer.effect(
  CoachRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<Coach>(COLLECTION);
    return {
      getById: (id: CoachId) =>
        mongoOp("coaches.getById", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) => (doc ? parseCoach(doc) : Effect.succeed(null))),
        ),
      list: (filter: CoachFilter) => {
        // Push `verified` down to the index; specialty (substring), femaleOnly
        // (convention) and price are applied in app to mirror in-memory exactly.
        const q: Filter<Coach> = {};
        if (filter.verifiedOnly) q.verified = true;
        return mongoOp("coaches.list", () => col.find(q).toArray()).pipe(
          Effect.flatMap((docs) =>
            Effect.forEach(docs, parseCoach).pipe(
              Effect.map((rows) =>
                rows.filter((c) => {
                  if (
                    filter.specialty &&
                    !c.specialties.some((s) => s.includes(filter.specialty!))
                  )
                    return false;
                  if (
                    filter.maxPricePaise !== undefined &&
                    c.pricePerSession > filter.maxPricePaise
                  )
                    return false;
                  if (filter.femaleOnly && !matchesFemaleOnly(c)) return false;
                  return true;
                }),
              ),
            ),
          ),
        );
      },
      update: (id, patch) =>
        mongoOp("coaches.findForUpdate", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) =>
            doc
              ? parseCoach(doc).pipe(
                  Effect.map(patch),
                  Effect.flatMap((next) =>
                    mongoOp("coaches.update", () => col.replaceOne({ id }, next)).pipe(
                      Effect.as(next),
                    ),
                  ),
                )
              : Effect.succeed(null),
          ),
        ),
    };
  }),
);

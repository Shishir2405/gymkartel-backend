import { Effect, Layer } from "effect";
import { Gym, TIER_RANK, type GymId } from "@gymkartel/contracts";
import type { Filter } from "mongodb";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { GymRepo, type GymQuery } from "../application/gym-repo.js";

const COLLECTION = "gyms";

const parseGym = (doc: unknown): Effect.Effect<Gym, DatabaseError> => {
  const r = Gym.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "gyms.parse", cause: r.error }));
};

export const GymRepoMongo: Layer.Layer<GymRepo, never, Mongo> = Layer.effect(
  GymRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<Gym>(COLLECTION);
    return {
      getById: (id: GymId) =>
        mongoOp("gyms.getById", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) => (doc ? parseGym(doc) : Effect.succeed(null))),
        ),
      getByCheckInCode: (code: string) =>
        mongoOp("gyms.getByCheckInCode", () => col.findOne({ checkInCode: code })).pipe(
          Effect.flatMap((doc) => (doc ? parseGym(doc) : Effect.succeed(null))),
        ),
      list: (query: GymQuery) => {
        const filter: Filter<Gym> = {};
        if (query.zone) filter.zone = query.zone;
        if (query.tier && !query.includeOtherTiers) filter.tier = query.tier;
        return mongoOp("gyms.list", () => col.find(filter).toArray()).pipe(
          Effect.flatMap((docs) =>
            Effect.forEach(docs, parseGym).pipe(
              Effect.map((rows) =>
                query.tier && query.includeOtherTiers
                  ? rows.filter(
                      (g) => TIER_RANK[g.tier] <= TIER_RANK[query.tier!] + 1,
                    )
                  : rows,
              ),
            ),
          ),
        );
      },
      setLiveBusyFraction: (id: GymId, fraction: number) =>
        mongoOp("gyms.findForBusyUpdate", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) =>
            doc
              ? parseGym(doc).pipe(
                  Effect.map((g): Gym => ({ ...g, liveBusyFraction: fraction })),
                  Effect.flatMap((next) =>
                    mongoOp("gyms.setLiveBusyFraction", () =>
                      col.replaceOne({ id }, next),
                    ).pipe(Effect.as(next)),
                  ),
                )
              : Effect.succeed(null),
          ),
        ),
    };
  }),
);

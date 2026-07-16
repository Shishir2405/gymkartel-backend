import { Context, Effect, Layer } from "effect";
import type { Coach, CoachId, Paise } from "@gymkartel/contracts";
import { CoachNotFound } from "./errors.js";
import type { DatabaseError } from "../../../shared/errors/errors.js";
import { takeHomePaise } from "../domain/earnings.js";
import { CoachRepo, type CoachFilter } from "./coach-repo.js";

export interface CoachesServiceApi {
  readonly browse: (filter: CoachFilter) => Effect.Effect<Coach[], DatabaseError>;
  readonly profile: (
    id: CoachId,
  ) => Effect.Effect<Coach, CoachNotFound | DatabaseError>;
  readonly takeHome: (pricePerSession: Paise) => Paise;
}

export class CoachesService extends Context.Tag("features/coaches/CoachesService")<
  CoachesService,
  CoachesServiceApi
>() {}

export const CoachesServiceLive = Layer.effect(
  CoachesService,
  Effect.gen(function* () {
    const coaches = yield* CoachRepo;
    return {
      browse: (filter) => coaches.list(filter),
      profile: (id) =>
        Effect.gen(function* () {
          const coach = yield* coaches.getById(id);
          if (!coach) return yield* Effect.fail(new CoachNotFound({ coachId: id }));
          return coach;
        }),
      takeHome: (pricePerSession) => takeHomePaise(pricePerSession),
    };
  }),
);

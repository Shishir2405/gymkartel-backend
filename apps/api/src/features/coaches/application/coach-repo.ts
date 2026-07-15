import { Context, Effect } from "effect";
import type { Coach, CoachId } from "@gymkartel/contracts";
import type { DatabaseError } from "../../../shared/errors/errors.js";

export interface CoachFilter {
  readonly specialty?: string;
  readonly maxPricePaise?: number;
  readonly femaleOnly?: boolean;
  readonly verifiedOnly?: boolean;
}

export interface CoachRepoApi {
  readonly getById: (id: CoachId) => Effect.Effect<Coach | null, DatabaseError>;
  readonly list: (filter: CoachFilter) => Effect.Effect<Coach[], DatabaseError>;
  readonly update: (
    id: CoachId,
    patch: (coach: Coach) => Coach,
  ) => Effect.Effect<Coach | null, DatabaseError>;
}

export class CoachRepo extends Context.Tag("features/coaches/CoachRepo")<
  CoachRepo,
  CoachRepoApi
>() {}

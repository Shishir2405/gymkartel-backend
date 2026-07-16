import { Context, Effect } from "effect";
import type { Gym, GymId, Tier, Zone } from "@gymkartel/contracts";
import type { DatabaseError } from "../../../shared/errors/errors.js";

export interface GymQuery {
  readonly zone?: Zone;
  readonly tier?: Tier;
  readonly includeOtherTiers?: boolean;
}

export interface GymRepoApi {
  readonly getById: (id: GymId) => Effect.Effect<Gym | null, DatabaseError>;
  readonly getByCheckInCode: (
    code: string,
  ) => Effect.Effect<Gym | null, DatabaseError>;
  readonly list: (query: GymQuery) => Effect.Effect<Gym[], DatabaseError>;
  readonly setLiveBusyFraction: (
    id: GymId,
    fraction: number,
  ) => Effect.Effect<Gym | null, DatabaseError>;
}

export class GymRepo extends Context.Tag("features/gyms/GymRepo")<
  GymRepo,
  GymRepoApi
>() {}

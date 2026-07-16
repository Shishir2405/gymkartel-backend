import { Context, Effect } from "effect";
import type { Pass, PassId, UserId } from "@gymkartel/contracts";
import type { DatabaseError } from "../../../shared/errors/errors.js";

export interface PassRepoApi {
  readonly getById: (id: PassId) => Effect.Effect<Pass | null, DatabaseError>;
  readonly latestForUser: (
    userId: UserId,
  ) => Effect.Effect<Pass | null, DatabaseError>;
  readonly activeForUser: (
    userId: UserId,
  ) => Effect.Effect<Pass | null, DatabaseError>;
  readonly insert: (pass: Pass) => Effect.Effect<Pass, DatabaseError>;
  readonly update: (
    id: PassId,
    patch: (pass: Pass) => Pass,
  ) => Effect.Effect<Pass | null, DatabaseError>;
  readonly findByOrderId: (
    orderId: string,
  ) => Effect.Effect<Pass | null, DatabaseError>;
}

export class PassRepo extends Context.Tag("features/passes/PassRepo")<
  PassRepo,
  PassRepoApi
>() {}

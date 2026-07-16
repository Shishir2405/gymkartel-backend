import { Context, Effect } from "effect";
import type { PhoneNumber, User, UserId } from "@gymkartel/contracts";
import type { DatabaseError } from "../../../shared/errors/errors.js";

export interface UserRepoApi {
  readonly findById: (id: UserId) => Effect.Effect<User | null, DatabaseError>;
  readonly findByPhone: (
    phone: PhoneNumber,
  ) => Effect.Effect<User | null, DatabaseError>;
  readonly insert: (user: User) => Effect.Effect<User, DatabaseError>;
  readonly update: (
    id: UserId,
    patch: (user: User) => User,
  ) => Effect.Effect<User | null, DatabaseError>;
}

export class UserRepo extends Context.Tag("features/UserRepo")<
  UserRepo,
  UserRepoApi
>() {}

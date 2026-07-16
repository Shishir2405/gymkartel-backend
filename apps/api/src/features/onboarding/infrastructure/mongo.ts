import { Effect, Layer } from "effect";
import { User, type PhoneNumber, type UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { UserRepo } from "../application/user-repo.js";

const COLLECTION = "users";

const parseUser = (doc: unknown): Effect.Effect<User, DatabaseError> => {
  const r = User.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "users.parse", cause: r.error }));
};

export const UserRepoMongo: Layer.Layer<UserRepo, never, Mongo> = Layer.effect(
  UserRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<User>(COLLECTION);
    return {
      findById: (id: UserId) =>
        mongoOp("users.findById", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) => (doc ? parseUser(doc) : Effect.succeed(null))),
        ),
      findByPhone: (phone: PhoneNumber) =>
        mongoOp("users.findByPhone", () => col.findOne({ phone })).pipe(
          Effect.flatMap((doc) => (doc ? parseUser(doc) : Effect.succeed(null))),
        ),
      insert: (user) =>
        parseUser(user).pipe(
          Effect.flatMap((valid) =>
            mongoOp("users.insert", () => col.insertOne(valid)).pipe(
              Effect.as(valid),
            ),
          ),
        ),
      update: (id, patch) =>
        mongoOp("users.findForUpdate", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) =>
            doc
              ? parseUser(doc).pipe(
                  Effect.map(patch),
                  Effect.flatMap((next) =>
                    mongoOp("users.update", () =>
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

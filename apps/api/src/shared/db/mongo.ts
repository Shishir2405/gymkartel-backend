import { Context, Effect, Layer } from "effect";
import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import { Config } from "../config/config.js";
import { DatabaseError } from "../errors/errors.js";

export interface MongoApi {
  readonly db: Db;
  readonly collection: <T extends Document = Document>(name: string) => Collection<T>;
}

export class Mongo extends Context.Tag("shared/Mongo")<Mongo, MongoApi>() {}

export const MongoLive = Layer.scoped(
  Mongo,
  Effect.gen(function* () {
    const config = yield* Config;
    const client = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => MongoClient.connect(config.mongoUri),
        catch: (cause) => new DatabaseError({ op: "connect", cause }),
      }),
      (c) => Effect.promise(() => c.close()),
    );
    const db = client.db(config.mongoDb);
    return {
      db,
      collection: <T extends Document = Document>(name: string) =>
        db.collection<T>(name),
    };
  }),
);

export const mongoOp = <A>(
  op: string,
  thunk: () => Promise<A>,
): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({ try: thunk, catch: (cause) => new DatabaseError({ op, cause }) });

import { Effect } from "effect";
import { MongoClient } from "mongodb";
import { ConfigLive, Config } from "../config/config.js";
import { createPinoLogger } from "../logger/logger.js";
import { COLLECTION_INDEXES } from "./indexes.js";

const program = Effect.gen(function* () {
  const config = yield* Config;
  const log = createPinoLogger(config);
  const client = yield* Effect.tryPromise({
    try: () => MongoClient.connect(config.mongoUri),
    catch: (cause) => new Error(`mongo connect failed: ${String(cause)}`),
  });
  const db = client.db(config.mongoDb);
  for (const [collection, indexes] of Object.entries(COLLECTION_INDEXES)) {
    yield* Effect.tryPromise({
      try: () => db.collection(collection).createIndexes(indexes),
      catch: (cause) => new Error(`createIndexes(${collection}) failed: ${String(cause)}`),
    });
    log.info({ collection, count: indexes.length }, "indexes applied");
  }
  yield* Effect.promise(() => client.close());
});

Effect.runPromise(program.pipe(Effect.provide(ConfigLive))).catch((err: unknown) => {
  process.stderr.write(`index apply failed: ${String(err)}\n`);
  process.exit(1);
});

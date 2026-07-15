import { Context, Effect, Layer } from "effect";
import Redis from "ioredis";
import { Config } from "../config/config.js";
import { ExternalServiceError } from "../errors/errors.js";

/**
 * Redis (ioredis) as a scoped Effect service. Used for session/refresh token
 * families, OTP + offline-checkin idempotency keys, leaderboard hot cache and
 * rate-limiter buckets. `lazyConnect` keeps construction side-effect-free until
 * the first command, so building the runtime never dials a socket.
 */
export class RedisClient extends Context.Tag("shared/RedisClient")<
  RedisClient,
  Redis
>() {}

export const RedisLive = Layer.scoped(
  RedisClient,
  Effect.gen(function* () {
    const config = yield* Config;
    return yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Redis(config.redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 2,
          }),
      ),
      (c) => Effect.sync(() => c.disconnect()),
    );
  }),
);

export const redisOp = <A>(
  op: string,
  thunk: () => Promise<A>,
): Effect.Effect<A, ExternalServiceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new ExternalServiceError({ service: `redis:${op}`, cause }),
  });

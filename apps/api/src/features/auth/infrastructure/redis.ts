import { Effect, Layer } from "effect";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { RedisClient, redisOp } from "../../../shared/redis/redis.js";
import { Config } from "../../../shared/config/config.js";
import { RateLimitedError } from "../../../shared/errors/errors.js";
import { OtpStore, RateLimiter, SessionStore, type OtpRecord } from "../application/ports.js";

export const OtpStoreRedis: Layer.Layer<OtpStore, never, RedisClient> = Layer.effect(
  OtpStore,
  Effect.gen(function* () {
    const redis = yield* RedisClient;
    const key = (phone: string) => `otp:${phone}`;
    return {
      put: (phone, record, ttlSeconds) =>
        redisOp("otp.put", () =>
          redis.set(key(phone), JSON.stringify(record), "EX", ttlSeconds),
        ).pipe(Effect.asVoid),
      get: (phone) =>
        redisOp("otp.get", () => redis.get(key(phone))).pipe(
          Effect.map((raw) => (raw ? (JSON.parse(raw) as OtpRecord) : null)),
        ),
      bumpAttempts: (phone) =>
        redisOp("otp.bump", async () => {
          const raw = await redis.get(key(phone));
          if (!raw) return 0;
          const rec = JSON.parse(raw) as OtpRecord;
          const next: OtpRecord = { ...rec, attempts: rec.attempts + 1 };
          const ttl = await redis.ttl(key(phone));
          await redis.set(key(phone), JSON.stringify(next), "EX", Math.max(1, ttl));
          return next.attempts;
        }),
      clear: (phone) =>
        redisOp("otp.clear", () => redis.del(key(phone))).pipe(Effect.asVoid),
    };
  }),
);

export const SessionStoreRedis: Layer.Layer<SessionStore, never, RedisClient> =
  Layer.effect(
    SessionStore,
    Effect.gen(function* () {
      const redis = yield* RedisClient;
      const key = (userId: string) => `sess:fam:${userId}`;
      return {
        setFamily: (userId, fam, ttlSeconds) =>
          redisOp("sess.set", () => redis.set(key(userId), fam, "EX", ttlSeconds)).pipe(
            Effect.asVoid,
          ),
        getFamily: (userId) => redisOp("sess.get", () => redis.get(key(userId))),
      };
    }),
  );

export const RateLimiterRedisLive: Layer.Layer<
  RateLimiter,
  never,
  RedisClient | Config
> = Layer.effect(
  RateLimiter,
  Effect.gen(function* () {
    const redis = yield* RedisClient;
    const limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "rl",
      points: 5,
      duration: 60,
    });
    return {
      consume: (rlKey, points = 1) =>
        Effect.tryPromise({
          try: () => limiter.consume(rlKey, points),
          catch: () => new RateLimitedError({ retryAfterMs: 60_000 }),
        }).pipe(Effect.asVoid),
    };
  }),
);

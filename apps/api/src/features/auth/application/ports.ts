import { Context, Effect } from "effect";
import type { PhoneNumber } from "@gymkartel/contracts";
import type { ExternalServiceError, RateLimitedError } from "../../../shared/errors/errors.js";

/** A stored OTP challenge. */
export interface OtpRecord {
  readonly codeHash: string;
  readonly expiresAt: number;
  readonly attempts: number;
}

/**
 * OTP challenge store (Redis in production). Holds the hashed code with a TTL
 * and an attempt counter so brute force is bounded.
 */
export interface OtpStoreApi {
  readonly put: (
    phone: PhoneNumber,
    record: OtpRecord,
    ttlSeconds: number,
  ) => Effect.Effect<void, ExternalServiceError>;
  readonly get: (
    phone: PhoneNumber,
  ) => Effect.Effect<OtpRecord | null, ExternalServiceError>;
  readonly bumpAttempts: (
    phone: PhoneNumber,
  ) => Effect.Effect<number, ExternalServiceError>;
  readonly clear: (phone: PhoneNumber) => Effect.Effect<void, ExternalServiceError>;
}

export class OtpStore extends Context.Tag("features/auth/OtpStore")<
  OtpStore,
  OtpStoreApi
>() {}

/**
 * Rate limiter port (rate-limiter-flexible in production). Consumes a point for
 * the key; fails with RateLimitedError when the bucket is empty.
 */
export interface RateLimiterApi {
  readonly consume: (
    key: string,
    points?: number,
  ) => Effect.Effect<void, RateLimitedError | ExternalServiceError>;
}

export class RateLimiter extends Context.Tag("features/auth/RateLimiter")<
  RateLimiter,
  RateLimiterApi
>() {}

/**
 * Refresh-token family store — tracks the currently-valid family id per user so
 * a rotated (or reused) refresh token can be detected and revoked.
 */
export interface SessionStoreApi {
  readonly setFamily: (
    userId: string,
    fam: string,
    ttlSeconds: number,
  ) => Effect.Effect<void, ExternalServiceError>;
  readonly getFamily: (
    userId: string,
  ) => Effect.Effect<string | null, ExternalServiceError>;
}

export class SessionStore extends Context.Tag("features/auth/SessionStore")<
  SessionStore,
  SessionStoreApi
>() {}

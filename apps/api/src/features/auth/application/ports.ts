import { Context, Effect } from "effect";
import type { PhoneNumber } from "@gymkartel/contracts";
import type { ExternalServiceError, RateLimitedError } from "../../../shared/errors/errors.js";

export interface OtpRecord {
  readonly codeHash: string;
  readonly expiresAt: number;
  readonly attempts: number;
}

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

import { Context, Effect, Layer } from "effect";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { PhoneNumber, type User } from "@gymkartel/contracts";
import { Config } from "../../../shared/config/config.js";
import { Clock } from "../../../shared/time/clock.js";
import { Logger } from "../../../shared/logger/logger.js";
import {
  TokenService,
  type InvalidTokenError,
  type TokenPair,
} from "../../../shared/auth/tokens.js";
import {
  ValidationError,
  UnauthorizedError,
  type ExternalServiceError,
  type RateLimitedError,
  type DatabaseError,
} from "../../../shared/errors/errors.js";
import { UserRepo } from "../../onboarding/application/user-repo.js";
import {
  NotificationService,
  TEMPLATE,
} from "../../notifications/application/port.js";
import { InvalidOtpError, OtpExpiredError } from "../domain/errors.js";
import { OtpStore, RateLimiter, SessionStore } from "./ports.js";

const hashCode = (code: string): string =>
  createHash("sha256").update(code).digest("hex");

export interface AuthServiceApi {
  readonly requestOtp: (
    rawPhone: string,
  ) => Effect.Effect<
    boolean,
    ValidationError | RateLimitedError | ExternalServiceError
  >;
  readonly verifyOtp: (
    rawPhone: string,
    code: string,
  ) => Effect.Effect<
    TokenPair,
    | ValidationError
    | InvalidOtpError
    | OtpExpiredError
    | ExternalServiceError
    | DatabaseError
  >;
  readonly refreshSession: (
    refreshToken: string,
  ) => Effect.Effect<
    TokenPair,
    InvalidTokenError | UnauthorizedError | ExternalServiceError | DatabaseError
  >;
}

export class AuthService extends Context.Tag("features/auth/AuthService")<
  AuthService,
  AuthServiceApi
>() {}

const parsePhone = (raw: string): Effect.Effect<PhoneNumber, ValidationError> => {
  const result = PhoneNumber.safeParse(raw);
  return result.success
    ? Effect.succeed(result.data)
    : Effect.fail(
        new ValidationError({ field: "phone", message: "Invalid Indian mobile number" }),
      );
};

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const config = yield* Config;
    const clock = yield* Clock;
    const otpStore = yield* OtpStore;
    const rateLimiter = yield* RateLimiter;
    const sessions = yield* SessionStore;
    const tokens = yield* TokenService;
    const users = yield* UserRepo;
    const notifier = yield* NotificationService;
    const logger = yield* Logger;

    return {
      requestOtp: (rawPhone) =>
        Effect.gen(function* () {
          const phone = yield* parsePhone(rawPhone);
          // Two buckets: per-phone (abuse) and coarse global handled at edge.
          yield* rateLimiter.consume(`otp:req:${phone}`);
          const code = String(randomInt(100000, 1000000)); // 6-digit
          const now = yield* clock.now;
          yield* otpStore.put(
            phone,
            {
              codeHash: hashCode(code),
              expiresAt: now.getTime() + config.otpTtlSeconds * 1000,
              attempts: 0,
            },
            config.otpTtlSeconds,
          );
          // Enqueue via NotificationService (Brevo SMS). Never log the code.
          yield* notifier
            .send({
              channel: "SMS",
              template: TEMPLATE.otpSms,
              to: phone,
              params: { code, ttlMin: Math.floor(config.otpTtlSeconds / 60) },
            })
            .pipe(
              Effect.catchAll((e) =>
                logger.error("otp dispatch failed", { tag: e._tag }),
              ),
            );
          return true;
        }),

      verifyOtp: (rawPhone, code) =>
        Effect.gen(function* () {
          const phone = yield* parsePhone(rawPhone);
          const record = yield* otpStore.get(phone);
          if (!record) return yield* Effect.fail(new OtpExpiredError({ phone }));
          const now = yield* clock.now;
          if (now.getTime() > record.expiresAt) {
            yield* otpStore.clear(phone);
            return yield* Effect.fail(new OtpExpiredError({ phone }));
          }
          if (record.attempts >= config.otpMaxAttempts) {
            yield* otpStore.clear(phone);
            return yield* Effect.fail(new OtpExpiredError({ phone }));
          }
          if (hashCode(code) !== record.codeHash) {
            const attempts = yield* otpStore.bumpAttempts(phone);
            return yield* Effect.fail(
              new InvalidOtpError({
                attemptsLeft: Math.max(0, config.otpMaxAttempts - attempts),
              }),
            );
          }
          yield* otpStore.clear(phone);

          // Existing user → login; new user → provisional account (profile
          // completed in onboarding). We only create the auth shell here.
          const existing = yield* users.findByPhone(phone);
          const user: User | null = existing;
          if (!user) {
            // No profile yet: issue tokens against a phone-derived subject so the
            // client can drive onboarding; onboarding.createProfile fills the doc.
            const provisionalId = `pending_${hashCode(phone).slice(0, 16)}`;
            const fam = randomUUID();
            yield* sessions.setFamily(provisionalId, fam, config.jwtRefreshTtlSeconds);
            return yield* tokens.issue(
              { sub: provisionalId as User["id"], role: "MEMBER" },
              fam,
            );
          }
          const fam = randomUUID();
          yield* sessions.setFamily(user.id, fam, config.jwtRefreshTtlSeconds);
          return yield* tokens.issue({ sub: user.id, role: user.role }, fam);
        }),

      refreshSession: (refreshToken) =>
        Effect.gen(function* () {
          const claims = yield* tokens.verifyRefresh(refreshToken);
          const currentFam = yield* sessions.getFamily(claims.sub);
          if (currentFam === null || currentFam !== claims.fam) {
            // Reuse of an old/rotated token → treat family as compromised.
            return yield* Effect.fail(
              new UnauthorizedError({ reason: "refresh token reuse detected" }),
            );
          }
          const user = yield* users.findById(claims.sub);
          const role = user?.role ?? "MEMBER";
          const nextFam = randomUUID();
          yield* sessions.setFamily(claims.sub, nextFam, config.jwtRefreshTtlSeconds);
          return yield* tokens.issue({ sub: claims.sub, role }, nextFam);
        }),
    };
  }),
);

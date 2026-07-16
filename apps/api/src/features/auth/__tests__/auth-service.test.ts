import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { AuthService, AuthServiceLive } from "../application/auth-service.js";
import {
  OtpStoreMemory,
  RateLimiterAllow,
  SessionStoreMemory,
} from "../infrastructure/in-memory.js";
import { UserRepoMemory } from "../../onboarding/infrastructure/in-memory.js";
import {
  NotificationServiceMemory,
  NotificationRecorder,
} from "../../notifications/infrastructure/in-memory.js";
import { ConfigTest } from "../../../shared/config/config.js";
import { ClockFixed } from "../../../shared/time/clock.js";
import { LoggerTest } from "../../../shared/logger/logger.js";
import { TokenServiceLive } from "../../../shared/auth/tokens.js";

const buildLayer = (recorder: NotificationRecorder, now: Date) => {
  const base = Layer.mergeAll(
    ConfigTest(),
    ClockFixed(now),
    LoggerTest,
    OtpStoreMemory,
    RateLimiterAllow,
    SessionStoreMemory,
    UserRepoMemory(),
    NotificationServiceMemory(recorder),
  );
  const tokens = TokenServiceLive.pipe(Layer.provide(base));
  return AuthServiceLive.pipe(Layer.provide(Layer.mergeAll(base, tokens)));
};

describe("AuthService (application, in-memory ports)", () => {
  const now = new Date("2026-06-01T10:00:00.000Z");

  it("requests an OTP and dispatches an SMS via NotificationService", async () => {
    const recorder = new NotificationRecorder();
    const layer = buildLayer(recorder, now);
    const ok = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService;
        return yield* auth.requestOtp("+919876543210");
      }).pipe(Effect.provide(layer)),
    );
    expect(ok).toBe(true);
    expect(recorder.sent).toHaveLength(1);
    expect(recorder.sent[0]?.channel).toBe("SMS");
    expect(recorder.sent[0]?.params.code).toBeDefined();
  });

  it("rejects an invalid OTP with attempts remaining", async () => {
    const recorder = new NotificationRecorder();
    const layer = buildLayer(recorder, now);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService;
        yield* auth.requestOtp("+919876543210");
        return yield* auth
          .verifyOtp("+919876543210", "000000")
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") expect(result.left._tag).toBe("InvalidOtpError");
  });

  it("verifies the correct OTP and issues a token pair", async () => {
    const recorder = new NotificationRecorder();
    const layer = buildLayer(recorder, now);
    const tokens = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService;
        yield* auth.requestOtp("+919876543210");
        const code = String(recorder.sent[0]?.params.code);
        return yield* auth.verifyOtp("+919876543210", code);
      }).pipe(Effect.provide(layer)),
    );
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it("refreshes a session and rotates the refresh token", async () => {
    const recorder = new NotificationRecorder();
    const layer = buildLayer(recorder, now);
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService;
        yield* auth.requestOtp("+919876543210");
        const code = String(recorder.sent[0]?.params.code);
        const pair = yield* auth.verifyOtp("+919876543210", code);
        const refreshed = yield* auth.refreshSession(pair.refreshToken);
        const reuse = yield* auth
          .refreshSession(pair.refreshToken)
          .pipe(Effect.either);
        return { refreshed, reuse };
      }).pipe(Effect.provide(layer)),
    );
    expect(out.refreshed.accessToken).toBeTruthy();
    expect(out.reuse._tag).toBe("Left");
  });
});

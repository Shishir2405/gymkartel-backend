import { Effect, Layer } from "effect";
import type { PhoneNumber } from "@gymkartel/contracts";
import { OtpStore, RateLimiter, SessionStore, type OtpRecord } from "../application/ports.js";

export const OtpStoreMemory = Layer.sync(OtpStore, () => {
  const store = new Map<string, OtpRecord>();
  return {
    put: (phone, record) =>
      Effect.sync(() => {
        store.set(phone, record);
      }),
    get: (phone: PhoneNumber) => Effect.sync(() => store.get(phone) ?? null),
    bumpAttempts: (phone: PhoneNumber) =>
      Effect.sync(() => {
        const cur = store.get(phone);
        if (!cur) return 0;
        const next = { ...cur, attempts: cur.attempts + 1 };
        store.set(phone, next);
        return next.attempts;
      }),
    clear: (phone: PhoneNumber) =>
      Effect.sync(() => {
        store.delete(phone);
      }),
  };
});

export const RateLimiterAllow = Layer.succeed(RateLimiter, {
  consume: () => Effect.void,
});

export const SessionStoreMemory = Layer.sync(SessionStore, () => {
  const fams = new Map<string, string>();
  return {
    setFamily: (userId, fam) =>
      Effect.sync(() => {
        fams.set(userId, fam);
      }),
    getFamily: (userId) => Effect.sync(() => fams.get(userId) ?? null),
  };
});

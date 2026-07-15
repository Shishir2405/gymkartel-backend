import { Context, Effect, Layer } from "effect";

/**
 * Injectable clock so time-dependent logic (streaks, pass validity, OTP TTL)
 * is deterministic under test. Never call `Date.now()` inside a service.
 */
export class Clock extends Context.Tag("shared/Clock")<
  Clock,
  { readonly now: Effect.Effect<Date> }
>() {}

export const ClockLive = Layer.succeed(Clock, {
  now: Effect.sync(() => new Date()),
});

/** Fixed clock for tests. */
export const ClockFixed = (at: Date): Layer.Layer<Clock> =>
  Layer.succeed(Clock, { now: Effect.succeed(at) });

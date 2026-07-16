import { Context, Effect, Layer } from "effect";

export class Clock extends Context.Tag("shared/Clock")<
  Clock,
  { readonly now: Effect.Effect<Date> }
>() {}

export const ClockLive = Layer.succeed(Clock, {
  now: Effect.sync(() => new Date()),
});

export const ClockFixed = (at: Date): Layer.Layer<Clock> =>
  Layer.succeed(Clock, { now: Effect.succeed(at) });

import { Effect, Layer } from "effect";
import { Rabbit, ROUTING } from "../../../shared/mq/rabbit.js";
import { CheckInEvents } from "../application/ports.js";

export const CheckInEventsRabbit: Layer.Layer<CheckInEvents, never, Rabbit> =
  Layer.effect(
    CheckInEvents,
    Effect.gen(function* () {
      const rabbit = yield* Rabbit;
      return {
        recorded: (event) => rabbit.publish(ROUTING.checkinRecorded, event),
      };
    }),
  );

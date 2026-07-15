import { Effect, Layer } from "effect";
import { Rabbit, ROUTING } from "../../../shared/mq/rabbit.js";
import { CheckInEvents } from "../application/ports.js";

/**
 * RabbitMQ-backed `checkin.recorded` fan-out. Publishes to the topic exchange so
 * the workers app (streak recompute, leaderboard hot-cache, share-card render)
 * consumes it. The in-memory recorder is the test/local reference; this is the
 * production adapter wired on the mongo composition path.
 */
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

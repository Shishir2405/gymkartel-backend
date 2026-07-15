import { Effect, Layer } from "effect";
import { Rabbit, ROUTING } from "../../../shared/mq/rabbit.js";
import { ExternalServiceError } from "../../../shared/errors/errors.js";
import { IncidentEscalator } from "../application/safety-service.js";

/**
 * RabbitMQ-backed incident escalation. Publishes reported incidents onto the
 * escalation topic for the on-call worker. The broker error is remapped to the
 * port's `ExternalServiceError` so the safety service surface is unchanged.
 */
export const IncidentEscalatorRabbit: Layer.Layer<IncidentEscalator, never, Rabbit> =
  Layer.effect(
    IncidentEscalator,
    Effect.gen(function* () {
      const rabbit = yield* Rabbit;
      return {
        escalate: (report) =>
          rabbit
            .publish(ROUTING.incidentEscalation, report)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ExternalServiceError({ service: "rabbit:incident", cause }),
              ),
            ),
      };
    }),
  );

import { Effect, Layer } from "effect";
import { Rabbit, ROUTING } from "../../../shared/mq/rabbit.js";
import { ExternalServiceError } from "../../../shared/errors/errors.js";
import { IncidentEscalator } from "../application/safety-service.js";

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

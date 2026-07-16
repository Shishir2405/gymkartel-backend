import { Effect, Layer } from "effect";
import { z } from "zod";
import { UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { IncidentRepo, type IncidentReport } from "../application/safety-service.js";

const COLLECTION = "incidents";

const IncidentDoc = z.object({
  id: z.string().min(1),
  userId: UserId,
  kind: z.enum(["CALL_EMERGENCY", "ALERT_TRUSTED_CONTACT", "REPORT_INCIDENT"]),
  note: z.string(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  status: z.enum(["OPEN", "ESCALATED", "RESOLVED"]),
  createdAt: z.string().min(1),
});

const parseIncident = (doc: unknown): Effect.Effect<IncidentReport, DatabaseError> => {
  const r = IncidentDoc.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "incidents.parse", cause: r.error }));
};

export const IncidentRepoMongo: Layer.Layer<IncidentRepo, never, Mongo> = Layer.effect(
  IncidentRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<IncidentReport>(COLLECTION);
    return {
      create: (report) =>
        parseIncident(report).pipe(
          Effect.flatMap((valid) =>
            mongoOp("incidents.create", () => col.insertOne(valid)).pipe(
              Effect.as(valid),
            ),
          ),
        ),
      forUser: (userId) =>
        mongoOp("incidents.forUser", () =>
          col.find({ userId }).sort({ createdAt: -1 }).toArray(),
        ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseIncident))),
    };
  }),
);

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PhoneNumber, type UserId } from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import { newId } from "../../../shared/ids/ids.js";
import type { DatabaseError, ExternalServiceError } from "../../../shared/errors/errors.js";
import { UserRepo } from "../../onboarding/application/user-repo.js";
import {
  NotificationService,
  TEMPLATE,
} from "../../notifications/application/port.js";

export class TrustedContactMissing extends Data.TaggedError("TrustedContactMissing")<{
  readonly userId: string;
}> {}

export type SosKind = "CALL_EMERGENCY" | "ALERT_TRUSTED_CONTACT" | "REPORT_INCIDENT";

export interface IncidentReport {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: SosKind;
  readonly note: string;
  readonly location: { lat: number; lng: number } | null;
  readonly status: "OPEN" | "ESCALATED" | "RESOLVED";
  readonly createdAt: string;
}

export interface IncidentRepoApi {
  readonly create: (r: IncidentReport) => Effect.Effect<IncidentReport, DatabaseError>;
  readonly forUser: (userId: UserId) => Effect.Effect<IncidentReport[], DatabaseError>;
}

export class IncidentRepo extends Context.Tag("features/safety/IncidentRepo")<
  IncidentRepo,
  IncidentRepoApi
>() {}

export interface IncidentEscalatorApi {
  readonly escalate: (r: IncidentReport) => Effect.Effect<void, ExternalServiceError>;
}
export class IncidentEscalator extends Context.Tag("features/safety/IncidentEscalator")<
  IncidentEscalator,
  IncidentEscalatorApi
>() {}

export interface SafetyServiceApi {
  readonly sos: (input: {
    readonly userId: UserId;
    readonly kind: SosKind;
    readonly note?: string;
    readonly location?: { lat: number; lng: number };
  }) => Effect.Effect<
    IncidentReport,
    TrustedContactMissing | DatabaseError | ExternalServiceError
  >;
  readonly setTrustedContact: (
    userId: UserId,
    name: string,
    phone: string,
  ) => Effect.Effect<void, DatabaseError>;
  readonly incidents: (
    userId: UserId,
  ) => Effect.Effect<IncidentReport[], DatabaseError>;
}

export class SafetyService extends Context.Tag("features/safety/SafetyService")<
  SafetyService,
  SafetyServiceApi
>() {}

export const SafetyServiceLive = Layer.effect(
  SafetyService,
  Effect.gen(function* () {
    const incidents = yield* IncidentRepo;
    const escalator = yield* IncidentEscalator;
    const users = yield* UserRepo;
    const notifier = yield* NotificationService;
    const clock = yield* Clock;

    return {
      sos: (input) =>
        Effect.gen(function* () {
          const now = yield* clock.now;
          if (input.kind === "ALERT_TRUSTED_CONTACT") {
            const user = yield* users.findById(input.userId);
            if (!user?.trustedContact) {
              return yield* Effect.fail(
                new TrustedContactMissing({ userId: input.userId }),
              );
            }
            yield* notifier.send({
              channel: "SMS",
              template: TEMPLATE.incidentAckSms,
              to: user.trustedContact.phone,
              params: {
                name: user.name,
                lat: input.location?.lat ?? 0,
                lng: input.location?.lng ?? 0,
              },
            });
          }
          const report: IncidentReport = {
            id: newId<string>("inc"),
            userId: input.userId,
            kind: input.kind,
            note: input.note ?? "",
            location: input.location ?? null,
            status: input.kind === "REPORT_INCIDENT" ? "ESCALATED" : "OPEN",
            createdAt: now.toISOString(),
          };
          const saved = yield* incidents.create(report);
          if (input.kind === "REPORT_INCIDENT") {
            yield* escalator.escalate(saved);
          }
          return saved;
        }),

      setTrustedContact: (userId, name, phone) =>
        Effect.gen(function* () {
          const parsed = PhoneNumber.safeParse(phone);
          yield* users.update(userId, (u) =>
            parsed.success
              ? { ...u, trustedContact: { name, phone: parsed.data } }
              : u,
          );
        }),

      incidents: (userId) => incidents.forUser(userId),
    };
  }),
);

export const IncidentRepoMemory: Layer.Layer<IncidentRepo> = Layer.sync(
  IncidentRepo,
  () => {
    const rows: IncidentReport[] = [];
    return {
      create: (r) =>
        Effect.sync(() => {
          rows.push(r);
          return r;
        }),
      forUser: (userId) => Effect.sync(() => rows.filter((r) => r.userId === userId)),
    };
  },
);

export const IncidentEscalatorMemory: Layer.Layer<IncidentEscalator> = Layer.succeed(
  IncidentEscalator,
  { escalate: () => Effect.void },
);

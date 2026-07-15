import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import type { User, UserId } from "@gymkartel/contracts";
import { ClockFixed } from "../../../shared/time/clock.js";
import { UserRepoMemory } from "../../onboarding/infrastructure/in-memory.js";
import {
  NotificationRecorder,
  NotificationServiceMemory,
} from "../../notifications/infrastructure/in-memory.js";
import {
  SafetyService,
  SafetyServiceLive,
  IncidentRepoMemory,
  IncidentEscalatorMemory,
} from "../application/safety-service.js";

const now = new Date("2026-06-10T10:00:00.000Z");

const user = (withContact: boolean): User => ({
  schemaVersion: 1,
  id: "u1" as UserId,
  phone: "+919876543210" as User["phone"],
  role: "MEMBER",
  name: "Member",
  tier: "STANDARD",
  zone: "z" as User["zone"],
  state: "KA" as User["state"],
  ...(withContact
    ? { trustedContact: { name: "Mom", phone: "+919812345678" as User["phone"] } }
    : {}),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

const layer = (u: User, recorder: NotificationRecorder) =>
  SafetyServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        ClockFixed(now),
        UserRepoMemory([u]),
        NotificationServiceMemory(recorder),
        IncidentRepoMemory,
        IncidentEscalatorMemory,
      ),
    ),
  );

describe("SafetyService (SOS + trusted contact + incident escalation)", () => {
  it("alerts the trusted contact with live location", async () => {
    const recorder = new NotificationRecorder();
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const safety = yield* SafetyService;
        return yield* safety.sos({
          userId: "u1" as UserId,
          kind: "ALERT_TRUSTED_CONTACT",
          location: { lat: 12.9, lng: 77.6 },
        });
      }).pipe(Effect.provide(layer(user(true), recorder))),
    );
    expect(report.kind).toBe("ALERT_TRUSTED_CONTACT");
    expect(recorder.sent).toHaveLength(1);
    expect(recorder.sent[0]?.to).toBe("+919812345678");
  });

  it("fails when alerting a trusted contact that was never set", async () => {
    const recorder = new NotificationRecorder();
    const res = await Effect.runPromise(
      Effect.gen(function* () {
        const safety = yield* SafetyService;
        return yield* safety
          .sos({ userId: "u1" as UserId, kind: "ALERT_TRUSTED_CONTACT" })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer(user(false), recorder))),
    );
    expect(res._tag).toBe("Left");
    if (res._tag === "Left") expect(res.left._tag).toBe("TrustedContactMissing");
  });

  it("escalates a reported incident", async () => {
    const recorder = new NotificationRecorder();
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const safety = yield* SafetyService;
        return yield* safety.sos({
          userId: "u1" as UserId,
          kind: "REPORT_INCIDENT",
          note: "unsafe equipment",
        });
      }).pipe(Effect.provide(layer(user(true), recorder))),
    );
    expect(report.status).toBe("ESCALATED");
  });
});

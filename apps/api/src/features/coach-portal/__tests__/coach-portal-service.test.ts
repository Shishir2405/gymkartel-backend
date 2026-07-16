import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import type { Booking, BookingId, Coach, CoachId, GymId, Paise, UserId } from "@gymkartel/contracts";
import { ClockFixed } from "../../../shared/time/clock.js";
import { COACH_TAKE_RATE } from "@gymkartel/contracts";
import { CoachRepoMemory } from "../../coaches/infrastructure/in-memory.js";
import { BookingRepoMemory } from "../../bookings/infrastructure/in-memory.js";
import {
  CoachPortalService,
  CoachPortalServiceLive,
} from "../application/coach-portal-service.js";

const now = new Date("2026-06-10T10:00:00.000Z");

const coach: Coach = {
  schemaVersion: 1,
  id: "c1" as CoachId,
  userId: "cu1" as UserId,
  displayName: "Coach",
  verified: true,
  bio: "bio",
  specialties: ["strength"],
  pricePerSession: 100000 as Paise,
  tierFloor: "STANDARD",
  certifications: [],
  ratingAverage: 4.7,
  sessionsCompleted: 42,
  transformationPhotoUrls: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

const bk = (id: string, when: string, status: Booking["status"]): Booking => ({
  schemaVersion: 1,
  id: id as BookingId,
  memberId: "u1" as UserId,
  coachId: "c1" as CoachId,
  gymId: "g1" as GymId,
  scheduledFor: when,
  price: 100000 as Paise,
  status,
  orderId: `o_${id}`,
  insured: true,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

const layer = CoachPortalServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      ClockFixed(now),
      CoachRepoMemory([coach]),
      BookingRepoMemory([
        bk("b1", now.toISOString(), "CONFIRMED"),
        bk("b2", "2026-06-20T07:00:00.000Z", "CONFIRMED"),
        bk("b3", now.toISOString(), "PENDING_PAYMENT"),
      ]),
    ),
  ),
);

describe("CoachPortalService (dashboard + earnings preview)", () => {
  it("summarises today's sessions, pending requests and take-home earnings", async () => {
    const dash = await Effect.runPromise(
      Effect.gen(function* () {
        const portal = yield* CoachPortalService;
        return yield* portal.dashboard("c1" as CoachId);
      }).pipe(Effect.provide(layer)),
    );
    expect(dash.todaysSessions).toHaveLength(1);
    expect(dash.pendingRequests).toHaveLength(1);
    expect(dash.sessionsCompleted).toBe(42);
    expect(dash.earningsPaise).toBe(Math.round(200000 * COACH_TAKE_RATE));
  });

  it("computes a T+2 earnings summary with take-home preview", async () => {
    const earnings = await Effect.runPromise(
      Effect.gen(function* () {
        const portal = yield* CoachPortalService;
        return yield* portal.earnings("c1" as CoachId);
      }).pipe(Effect.provide(layer)),
    );
    expect(earnings.payoutSchedule).toBe("T+2");
    expect(earnings.takeHomePaise).toBe(Math.round(earnings.grossPaise * COACH_TAKE_RATE));
  });
});

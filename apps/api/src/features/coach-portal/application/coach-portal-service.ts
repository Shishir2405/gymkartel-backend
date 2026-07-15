import { Context, Effect, Layer } from "effect";
import type { Booking, CoachId, Paise, UserId } from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import type { DatabaseError } from "../../../shared/errors/errors.js";
import { CoachRepo } from "../../coaches/application/coach-repo.js";
import { CoachNotFound } from "../../coaches/application/errors.js";
import { BookingRepo } from "../../bookings/application/booking-repo.js";
import { istDayNumber } from "../../streaks-ranks/domain/ist.js";
import { takeHomePaise } from "../../coaches/domain/earnings.js";

export interface CoachDashboard {
  readonly todaysSessions: readonly Booking[];
  readonly pendingRequests: readonly Booking[];
  readonly ratingAverage: number | null;
  readonly sessionsCompleted: number;
  /** Earnings preview across confirmed bookings (T+2 payout schedule). */
  readonly earningsPaise: Paise;
}

export interface CoachEarnings {
  readonly grossPaise: Paise;
  readonly takeHomePaise: Paise;
  readonly payoutSchedule: "T+2";
  /** Simplistic tax summary (TDS placeholder) for the coach's records. */
  readonly estimatedTdsPaise: Paise;
}

export interface CoachPortalServiceApi {
  readonly dashboard: (
    coachId: CoachId,
  ) => Effect.Effect<CoachDashboard, CoachNotFound | DatabaseError>;
  readonly calendar: (
    coachId: CoachId,
  ) => Effect.Effect<Booking[], DatabaseError>;
  readonly clients: (coachId: CoachId) => Effect.Effect<UserId[], DatabaseError>;
  readonly earnings: (
    coachId: CoachId,
  ) => Effect.Effect<CoachEarnings, DatabaseError>;
}

export class CoachPortalService extends Context.Tag(
  "features/coach-portal/CoachPortalService",
)<CoachPortalService, CoachPortalServiceApi>() {}

const isConfirmed = (b: Booking): boolean => b.status === "CONFIRMED" || b.status === "COMPLETED";

export const CoachPortalServiceLive = Layer.effect(
  CoachPortalService,
  Effect.gen(function* () {
    const coaches = yield* CoachRepo;
    const bookings = yield* BookingRepo;
    const clock = yield* Clock;

    return {
      dashboard: (coachId) =>
        Effect.gen(function* () {
          const coach = yield* coaches.getById(coachId);
          if (!coach) return yield* Effect.fail(new CoachNotFound({ coachId }));
          const now = yield* clock.now;
          const today = istDayNumber(now);
          const all = yield* bookings.forCoach(coachId);
          const todaysSessions = all.filter(
            (b) => isConfirmed(b) && istDayNumber(new Date(b.scheduledFor)) === today,
          );
          const pendingRequests = all.filter((b) => b.status === "PENDING_PAYMENT");
          const earningsPaise = all
            .filter(isConfirmed)
            .reduce((sum, b) => sum + takeHomePaise(b.price), 0) as Paise;
          return {
            todaysSessions,
            pendingRequests,
            ratingAverage: coach.ratingAverage ?? null,
            sessionsCompleted: coach.sessionsCompleted,
            earningsPaise,
          };
        }),

      calendar: (coachId) => bookings.forCoach(coachId),

      clients: (coachId) =>
        Effect.gen(function* () {
          const all = yield* bookings.forCoach(coachId);
          return [...new Set(all.filter(isConfirmed).map((b) => b.memberId))];
        }),

      earnings: (coachId) =>
        Effect.gen(function* () {
          const all = yield* bookings.forCoach(coachId);
          const gross = all
            .filter(isConfirmed)
            .reduce((sum, b) => sum + b.price, 0) as Paise;
          const take = takeHomePaise(gross);
          return {
            grossPaise: gross,
            takeHomePaise: take,
            payoutSchedule: "T+2" as const,
            // Placeholder 10% TDS estimate on take-home for the coach's summary.
            estimatedTdsPaise: Math.round(take * 0.1) as Paise,
          };
        }),
    };
  }),
);

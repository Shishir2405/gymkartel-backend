import { Context, Effect, Layer } from "effect";
import type {
  Booking,
  BookingId,
  CoachId,
  GymId,
  UserId,
} from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import { newId } from "../../../shared/ids/ids.js";
import type { DatabaseError, ExternalServiceError } from "../../../shared/errors/errors.js";
import { PaymentsService } from "../../payments/application/payments-service.js";
import type { CreatedOrder } from "../../payments/application/ports.js";
import type { OrderIntent } from "../../payments/domain/webhook.js";
import { CoachRepo } from "../../coaches/application/coach-repo.js";
import { CoachNotFound } from "../../coaches/application/errors.js";
import { AlreadyCancelled, BookingNotFound, SlotUnavailable } from "./errors.js";
import { BookingRepo } from "./booking-repo.js";

export interface BookingsServiceApi {
  readonly createBookingOrder: (input: {
    readonly memberId: UserId;
    readonly coachId: CoachId;
    readonly gymId: GymId;
    readonly scheduledFor: string;
  }) => Effect.Effect<
    CreatedOrder,
    CoachNotFound | SlotUnavailable | DatabaseError | ExternalServiceError
  >;
  readonly confirmFromOrder: (
    intent: OrderIntent,
  ) => Effect.Effect<Booking, DatabaseError>;
  readonly cancel: (
    bookingId: BookingId,
    by: "MEMBER" | "COACH",
  ) => Effect.Effect<Booking, BookingNotFound | AlreadyCancelled | DatabaseError>;
  readonly forMember: (
    memberId: UserId,
  ) => Effect.Effect<Booking[], DatabaseError>;
  readonly coachCalendar: (
    coachId: CoachId,
  ) => Effect.Effect<Booking[], DatabaseError>;
}

export class BookingsService extends Context.Tag("features/bookings/BookingsService")<
  BookingsService,
  BookingsServiceApi
>() {}

const CANCELLED = new Set<Booking["status"]>([
  "CANCELLED_BY_MEMBER",
  "CANCELLED_BY_COACH",
]);

export const BookingsServiceLive = Layer.effect(
  BookingsService,
  Effect.gen(function* () {
    const bookings = yield* BookingRepo;
    const coaches = yield* CoachRepo;
    const payments = yield* PaymentsService;
    const clock = yield* Clock;

    return {
      createBookingOrder: (input) =>
        Effect.gen(function* () {
          const coach = yield* coaches.getById(input.coachId);
          if (!coach) {
            return yield* Effect.fail(new CoachNotFound({ coachId: input.coachId }));
          }
          const taken = yield* bookings.atSlot(input.coachId, input.scheduledFor);
          if (taken && !CANCELLED.has(taken.status)) {
            return yield* Effect.fail(
              new SlotUnavailable({
                coachId: input.coachId,
                scheduledFor: input.scheduledFor,
              }),
            );
          }
          return yield* payments.createOrder({
            purpose: "BOOKING",
            userId: input.memberId,
            amountPaise: coach.pricePerSession,
            ref: {
              coachId: input.coachId,
              gymId: input.gymId,
              scheduledFor: input.scheduledFor,
            },
          });
        }),

      confirmFromOrder: (intent) =>
        Effect.gen(function* () {
          const existing = yield* bookings.findByOrderId(intent.orderId);
          if (existing) return existing;
          const now = yield* clock.now;
          const booking: Booking = {
            schemaVersion: 1,
            id: newId<BookingId>("bkg"),
            memberId: intent.userId as UserId,
            coachId: (intent.ref.coachId ?? "") as CoachId,
            gymId: (intent.ref.gymId ?? "") as GymId,
            scheduledFor: intent.ref.scheduledFor ?? now.toISOString(),
            price: intent.amountPaise as Booking["price"],
            status: "CONFIRMED",
            orderId: intent.orderId,
            insured: true,
            chatUnlockedAt: now.toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          return yield* bookings.insert(booking);
        }),

      cancel: (bookingId, by) =>
        Effect.gen(function* () {
          const booking = yield* bookings.getById(bookingId);
          if (!booking) {
            return yield* Effect.fail(new BookingNotFound({ bookingId }));
          }
          if (CANCELLED.has(booking.status)) {
            return yield* Effect.fail(new AlreadyCancelled({ bookingId }));
          }
          const now = yield* clock.now;
          const status: Booking["status"] =
            by === "MEMBER" ? "CANCELLED_BY_MEMBER" : "CANCELLED_BY_COACH";
          const updated = yield* bookings.update(bookingId, (b) => ({
            ...b,
            status,
            updatedAt: now.toISOString(),
          }));
          return updated ?? booking;
        }),

      forMember: (memberId) => bookings.forMember(memberId),
      coachCalendar: (coachId) => bookings.forCoach(coachId),
    };
  }),
);

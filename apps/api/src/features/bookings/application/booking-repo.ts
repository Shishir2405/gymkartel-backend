import { Context, Effect } from "effect";
import type { Booking, BookingId, CoachId, UserId } from "@gymkartel/contracts";
import type { DatabaseError } from "../../../shared/errors/errors.js";

export interface BookingRepoApi {
  readonly getById: (id: BookingId) => Effect.Effect<Booking | null, DatabaseError>;
  readonly forMember: (
    memberId: UserId,
  ) => Effect.Effect<Booking[], DatabaseError>;
  readonly forCoach: (coachId: CoachId) => Effect.Effect<Booking[], DatabaseError>;
  readonly atSlot: (
    coachId: CoachId,
    scheduledFor: string,
  ) => Effect.Effect<Booking | null, DatabaseError>;
  readonly insert: (booking: Booking) => Effect.Effect<Booking, DatabaseError>;
  readonly update: (
    id: BookingId,
    patch: (booking: Booking) => Booking,
  ) => Effect.Effect<Booking | null, DatabaseError>;
  readonly findByOrderId: (
    orderId: string,
  ) => Effect.Effect<Booking | null, DatabaseError>;
}

export class BookingRepo extends Context.Tag("features/bookings/BookingRepo")<
  BookingRepo,
  BookingRepoApi
>() {}

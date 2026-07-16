import { Effect, Layer } from "effect";
import { Booking, type BookingId, type CoachId, type UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { BookingRepo } from "../application/booking-repo.js";

const COLLECTION = "bookings";

const parseBooking = (doc: unknown): Effect.Effect<Booking, DatabaseError> => {
  const r = Booking.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "bookings.parse", cause: r.error }));
};

export const BookingRepoMongo: Layer.Layer<BookingRepo, never, Mongo> = Layer.effect(
  BookingRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<Booking>(COLLECTION);
    return {
      getById: (id: BookingId) =>
        mongoOp("bookings.getById", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) => (doc ? parseBooking(doc) : Effect.succeed(null))),
        ),
      forMember: (memberId: UserId) =>
        mongoOp("bookings.forMember", () =>
          col.find({ memberId }).sort({ scheduledFor: -1 }).toArray(),
        ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseBooking))),
      forCoach: (coachId: CoachId) =>
        mongoOp("bookings.forCoach", () => col.find({ coachId }).toArray()).pipe(
          Effect.flatMap((docs) => Effect.forEach(docs, parseBooking)),
        ),
      atSlot: (coachId: CoachId, scheduledFor: string) =>
        mongoOp("bookings.atSlot", () => col.findOne({ coachId, scheduledFor })).pipe(
          Effect.flatMap((doc) => (doc ? parseBooking(doc) : Effect.succeed(null))),
        ),
      insert: (booking) =>
        parseBooking(booking).pipe(
          Effect.flatMap((valid) =>
            mongoOp("bookings.insert", () => col.insertOne(valid)).pipe(
              Effect.as(valid),
            ),
          ),
        ),
      update: (id, patch) =>
        mongoOp("bookings.findForUpdate", () => col.findOne({ id })).pipe(
          Effect.flatMap((doc) =>
            doc
              ? parseBooking(doc).pipe(
                  Effect.map(patch),
                  Effect.flatMap((next) =>
                    mongoOp("bookings.update", () => col.replaceOne({ id }, next)).pipe(
                      Effect.as(next),
                    ),
                  ),
                )
              : Effect.succeed(null),
          ),
        ),
      findByOrderId: (orderId: string) =>
        mongoOp("bookings.findByOrderId", () => col.findOne({ orderId })).pipe(
          Effect.flatMap((doc) => (doc ? parseBooking(doc) : Effect.succeed(null))),
        ),
    };
  }),
);

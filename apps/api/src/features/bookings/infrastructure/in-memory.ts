import { Effect, Layer } from "effect";
import type { Booking } from "@gymkartel/contracts";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { BookingRepo } from "../application/booking-repo.js";

export const BookingRepoMemory = (
  seed: readonly Booking[] = [],
): Layer.Layer<BookingRepo> =>
  Layer.sync(BookingRepo, () => {
    const col = new InMemoryCollection<Booking>((b) => b.id, seed);
    return {
      getById: (id) => col.get(id),
      forMember: (memberId) =>
        Effect.gen(function* () {
          const rows = yield* col.filter((b) => b.memberId === memberId);
          rows.sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
          return rows;
        }),
      forCoach: (coachId) => col.filter((b) => b.coachId === coachId),
      atSlot: (coachId, scheduledFor) =>
        col.find((b) => b.coachId === coachId && b.scheduledFor === scheduledFor),
      insert: (booking) => col.insert(booking),
      update: (id, patch) => col.update(id, patch),
      findByOrderId: (orderId) => col.find((b) => b.orderId === orderId),
    };
  });

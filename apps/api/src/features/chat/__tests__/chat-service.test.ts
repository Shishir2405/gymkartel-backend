import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import type { Booking, BookingId, CoachId, GymId, UserId } from "@gymkartel/contracts";
import { ClockFixed } from "../../../shared/time/clock.js";
import { BookingRepoMemory } from "../../bookings/infrastructure/in-memory.js";
import {
  ChatService,
  ChatServiceLive,
  ChatRepoMemory,
} from "../application/chat-service.js";

const now = new Date("2026-06-10T10:00:00.000Z");

const booking = (id: string, unlocked: boolean): Booking => ({
  schemaVersion: 1,
  id: id as BookingId,
  memberId: "u1" as UserId,
  coachId: "c1" as CoachId,
  gymId: "g1" as GymId,
  scheduledFor: now.toISOString(),
  price: 80000 as Booking["price"],
  status: "CONFIRMED",
  orderId: "o1",
  insured: true,
  ...(unlocked ? { chatUnlockedAt: now.toISOString() } : {}),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

const layer = (b: Booking) =>
  ChatServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(ClockFixed(now), ChatRepoMemory, BookingRepoMemory([b])),
    ),
  );

describe("ChatService (unlock gate + mandatory PII masking)", () => {
  it("rejects sending before a booking unlocks chat", async () => {
    const res = await Effect.runPromise(
      Effect.gen(function* () {
        const chat = yield* ChatService;
        return yield* chat
          .send("bk_locked" as BookingId, "u1" as UserId, "hi")
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer(booking("bk_locked", false)))),
    );
    expect(res._tag).toBe("Left");
    if (res._tag === "Left") expect(res.left._tag).toBe("ChatLocked");
  });

  it("masks phone/UPI/links in delivered messages (both directions)", async () => {
    const msg = await Effect.runPromise(
      Effect.gen(function* () {
        const chat = yield* ChatService;
        return yield* chat.send(
          "bk_open" as BookingId,
          "u1" as UserId,
          "pay me 9876543210 at rahul@okhdfc or insta.com/coach",
        );
      }).pipe(Effect.provide(layer(booking("bk_open", true)))),
    );
    expect(msg.masked).toBe(true);
    expect(msg.text).not.toContain("9876543210");
    expect(msg.text).toContain("[number hidden]");
    expect(msg.text).toContain("[handle hidden]");
    expect(msg.text).toContain("[link hidden]");
  });

  it("enables a location-share pin that expires at session end", async () => {
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const chat = yield* ChatService;
        return yield* chat.shareLocation(
          "bk_open" as BookingId,
          "u1" as UserId,
          12.9,
          77.6,
        );
      }).pipe(Effect.provide(layer(booking("bk_open", true)))),
    );
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(now.getTime());
  });
});

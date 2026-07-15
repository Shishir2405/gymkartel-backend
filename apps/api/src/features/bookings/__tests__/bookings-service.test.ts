import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import type { Coach, CoachId, GymId, Paise, UserId } from "@gymkartel/contracts";
import { ConfigTest } from "../../../shared/config/config.js";
import { ClockFixed } from "../../../shared/time/clock.js";
import {
  PaymentsService,
  PaymentsServiceLive,
} from "../../payments/application/payments-service.js";
import {
  OrderRepoMemory,
  PaymentGatewayMemory,
} from "../../payments/infrastructure/in-memory.js";
import { CoachRepoMemory } from "../../coaches/infrastructure/in-memory.js";
import { BookingsService, BookingsServiceLive } from "../application/bookings-service.js";
import { BookingRepoMemory } from "../infrastructure/in-memory.js";

const now = new Date("2026-06-10T10:00:00.000Z");

const coach: Coach = {
  schemaVersion: 1,
  id: "c1" as CoachId,
  userId: "cu1" as UserId,
  displayName: "Coach",
  verified: true,
  bio: "bio",
  specialties: ["strength"],
  pricePerSession: 80000 as Paise,
  tierFloor: "STANDARD",
  certifications: [],
  sessionsCompleted: 10,
  transformationPhotoUrls: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

// One shared payments layer (same OrderRepo) provided to BOTH the bookings
// service and the test's reconcileWebhook call, so the created order is found.
const clock = ClockFixed(now);
const payments = PaymentsServiceLive.pipe(
  Layer.provide(Layer.mergeAll(PaymentGatewayMemory, OrderRepoMemory(), clock)),
);
const bookings = BookingsServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      ConfigTest(),
      clock,
      payments,
      CoachRepoMemory([coach]),
      BookingRepoMemory(),
    ),
  ),
);
const full = Layer.mergeAll(payments, bookings);

describe("BookingsService (slot, pay, confirm, cancel — idempotent)", () => {
  it("creates an order, rejects a double-booked slot, confirms + cancels", async () => {
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* BookingsService;
        const payments = yield* PaymentsService;
        const slot = "2026-06-12T07:00:00.000Z";
        const order = yield* svc.createBookingOrder({
          memberId: "u1" as UserId,
          coachId: "c1" as CoachId,
          gymId: "g1" as GymId,
          scheduledFor: slot,
        });
        // Pay + confirm.
        const body = JSON.stringify({
          event: "payment.captured",
          payload: {
            payment: {
              entity: {
                id: "pay1",
                order_id: order.orderId,
                amount: order.amountPaise,
                status: "captured",
              },
            },
          },
        });
        const outcome = yield* payments.reconcileWebhook(body, "valid");
        if (outcome.reconciliation.kind !== "ACTIVATE") throw new Error("expected activate");
        const booking = yield* svc.confirmFromOrder(outcome.reconciliation.intent);
        // Re-confirm is idempotent.
        const again = yield* svc.confirmFromOrder(outcome.reconciliation.intent);
        // Slot now taken → second order for same slot fails.
        const clash = yield* svc
          .createBookingOrder({
            memberId: "u2" as UserId,
            coachId: "c1" as CoachId,
            gymId: "g1" as GymId,
            scheduledFor: slot,
          })
          .pipe(Effect.either);
        // Cancel is idempotent (second cancel → AlreadyCancelled).
        const cancelled = yield* svc.cancel(booking.id, "MEMBER");
        const cancelAgain = yield* svc.cancel(booking.id, "MEMBER").pipe(Effect.either);
        return { booking, again, clash, cancelled, cancelAgain };
      }).pipe(Effect.provide(full)),
    );
    expect(out.booking.id).toBe(out.again.id);
    expect(out.booking.status).toBe("CONFIRMED");
    expect(out.booking.insured).toBe(true);
    expect(out.clash._tag).toBe("Left");
    if (out.clash._tag === "Left") expect(out.clash.left._tag).toBe("SlotUnavailable");
    expect(out.cancelled.status).toBe("CANCELLED_BY_MEMBER");
    expect(out.cancelAgain._tag).toBe("Left");
  });
});

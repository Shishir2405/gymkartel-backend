import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { passPrice } from "@gymkartel/contracts";
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
import { PassesService, PassesServiceLive } from "../application/passes-service.js";
import { PassRepoMemory } from "../infrastructure/in-memory.js";
import type { UserId } from "@gymkartel/contracts";

const now = new Date("2026-06-01T08:00:00.000Z");

const layer = (() => {
  const base = Layer.mergeAll(ConfigTest(), ClockFixed(now));
  const payments = PaymentsServiceLive.pipe(
    Layer.provide(Layer.mergeAll(PaymentGatewayMemory, OrderRepoMemory(), ClockFixed(now))),
  );
  const passLayer = PassesServiceLive.pipe(
    Layer.provide(Layer.mergeAll(payments, PassRepoMemory(), ClockFixed(now))),
  );
  return Layer.mergeAll(base, payments, passLayer);
})();

const userId = "user_1" as UserId;

describe("pass purchase money path (idempotent, single source of truth)", () => {
  it("prices the order from contracts and activates on paid webhook exactly once", async () => {
    const program = Effect.gen(function* () {
      const passes = yield* PassesService;
      const payments = yield* PaymentsService;

      const order = yield* passes.createOrder({
        userId,
        tier: "STANDARD",
        pack: "FIFTEEN_DAY",
      });
      expect(order.amountPaise).toBe(passPrice("STANDARD", "FIFTEEN_DAY"));

      // Simulate Razorpay captured webhook for that order.
      const body = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_1",
              order_id: order.orderId,
              amount: order.amountPaise,
              status: "captured",
            },
          },
        },
      });
      const outcome1 = yield* payments.reconcileWebhook(body, "valid");
      expect(outcome1.reconciliation.kind).toBe("ACTIVATE");

      const pass1 = yield* passes.activateFromOrder(outcome1.intent);
      // Replay the same webhook + activation → must not create a second pass.
      const outcome2 = yield* payments.reconcileWebhook(body, "valid");
      expect(outcome2.reconciliation.kind).toBe("NOOP");
      const pass2 = yield* passes.activateFromOrder(outcome1.intent);

      return { pass1, pass2 };
    }).pipe(Effect.provide(layer));

    const { pass1, pass2 } = await Effect.runPromise(program);
    expect(pass1.id).toBe(pass2.id);
    expect(pass1.daysTotal).toBe(15);
    expect(pass1.status).toBe("ACTIVE");
  });

  it("rejects a webhook whose captured amount doesn't match the order", async () => {
    const program = Effect.gen(function* () {
      const passes = yield* PassesService;
      const payments = yield* PaymentsService;
      const order = yield* passes.createOrder({
        userId: "user_2" as UserId,
        tier: "BASIC",
        pack: "THIRTY_DAY",
      });
      const body = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_x",
              order_id: order.orderId,
              amount: order.amountPaise - 100, // tampered
              status: "captured",
            },
          },
        },
      });
      return yield* payments.reconcileWebhook(body, "valid");
    }).pipe(Effect.provide(layer));

    const outcome = await Effect.runPromise(program);
    expect(outcome.reconciliation.kind).toBe("MARK_FAILED");
  });

  it("rejects a webhook with a bad signature", async () => {
    const program = Effect.gen(function* () {
      const payments = yield* PaymentsService;
      return yield* payments
        .reconcileWebhook("{}", "invalid")
        .pipe(Effect.either);
    }).pipe(Effect.provide(layer));
    const res = await Effect.runPromise(program);
    expect(res._tag).toBe("Left");
    if (res._tag === "Left")
      expect(res.left._tag).toBe("PaymentVerificationError");
  });
});

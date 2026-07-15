import { Effect } from "effect";
import { PaymentsService } from "../features/payments/application/payments-service.js";
import { PassesService } from "../features/passes/application/passes-service.js";
import { BookingsService } from "../features/bookings/application/bookings-service.js";
import type { AppRuntime } from "../runtime/runtime.js";

export interface WebhookResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/**
 * Razorpay webhook handler. Verifies the signature, reconciles the order intent
 * idempotently, then dispatches the ACTIVATE outcome to the owning feature
 * (pass activation / booking confirmation). Top-up captures need no dispatch —
 * the next check-in sync reads the paid order. ALWAYS returns 200 for a
 * verified+known order so Razorpay stops retrying (idempotency guarantees
 * replays are safe).
 */
export const handleRazorpayWebhook = async (
  runtime: AppRuntime,
  rawBody: string,
  signature: string,
): Promise<WebhookResult> => {
  const program = Effect.gen(function* () {
    const payments = yield* PaymentsService;
    const outcome = yield* payments.reconcileWebhook(rawBody, signature);
    if (outcome.reconciliation.kind !== "ACTIVATE") {
      return { handled: outcome.reconciliation.kind };
    }
    const intent = outcome.reconciliation.intent;
    switch (intent.purpose) {
      case "PASS": {
        const passes = yield* PassesService;
        const pass = yield* passes.activateFromOrder(intent);
        return { handled: "PASS_ACTIVATED", passId: pass.id };
      }
      case "BOOKING": {
        const bookings = yield* BookingsService;
        const booking = yield* bookings.confirmFromOrder(intent);
        return { handled: "BOOKING_CONFIRMED", bookingId: booking.id };
      }
      case "TOP_UP":
        return { handled: "TOP_UP_CAPTURED" };
      default:
        return { handled: "IGNORED" };
    }
  });

  const either = await runtime.runPromise(Effect.either(program));
  if (either._tag === "Left") {
    const err = either.left;
    // Signature failures → 400 (do not ack); unknown order → 404. Everything
    // else is retryable → 500 so Razorpay resends.
    const status =
      err._tag === "PaymentVerificationError"
        ? 400
        : err._tag === "OrderNotFound"
          ? 404
          : 500;
    return { status, body: { error: err._tag } };
  }
  return { status: 200, body: { ok: true, ...either.right } };
};

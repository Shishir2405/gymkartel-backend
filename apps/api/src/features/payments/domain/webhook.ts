import { z } from "zod";

/**
 * Razorpay webhook payload (trust boundary — Zod-validated after the signature
 * check). We model only the fields we reconcile on. Client-reported payment
 * status is NEVER trusted; only signature-verified webhooks + order fetch are.
 */
export const RazorpayWebhook = z.object({
  event: z.string().min(1),
  payload: z.object({
    payment: z
      .object({
        entity: z.object({
          id: z.string().min(1),
          order_id: z.string().min(1),
          amount: z.number().int().nonnegative(),
          status: z.string().min(1),
          method: z.string().optional(),
        }),
      })
      .optional(),
    order: z
      .object({
        entity: z.object({
          id: z.string().min(1),
          amount: z.number().int().nonnegative(),
          status: z.string().min(1),
        }),
      })
      .optional(),
  }),
});
export type RazorpayWebhook = z.infer<typeof RazorpayWebhook>;

export type PaymentPurpose = "PASS" | "TOP_UP" | "BOOKING";

/** The order-intent we persist when creating a Razorpay order. */
export interface OrderIntent {
  readonly orderId: string;
  readonly purpose: PaymentPurpose;
  readonly userId: string;
  readonly amountPaise: number;
  /** Reference to the thing being paid for (passPack, gymId, coachId+slot). */
  readonly ref: Readonly<Record<string, string>>;
  readonly status: "CREATED" | "PAID" | "FAILED";
  readonly createdAt: string;
}

/**
 * Given a stored intent and a verified webhook, decide the reconciliation. Pure
 * — the application layer performs the DB write + downstream effect. Idempotent:
 * an already-PAID intent yields NOOP so replays don't double-activate.
 */
export type Reconciliation =
  | { readonly kind: "ACTIVATE"; readonly intent: OrderIntent }
  | { readonly kind: "NOOP" }
  | { readonly kind: "MARK_FAILED"; readonly intent: OrderIntent };

export const reconcile = (
  intent: OrderIntent,
  webhook: RazorpayWebhook,
): Reconciliation => {
  if (intent.status === "PAID") return { kind: "NOOP" };
  const payment = webhook.payload.payment?.entity;
  if (payment && payment.status === "captured") {
    // Defence: the captured amount must match the order intent to the paise.
    if (payment.amount !== intent.amountPaise) {
      return { kind: "MARK_FAILED", intent };
    }
    return { kind: "ACTIVATE", intent: { ...intent, status: "PAID" } };
  }
  if (payment && (payment.status === "failed")) {
    return { kind: "MARK_FAILED", intent: { ...intent, status: "FAILED" } };
  }
  return { kind: "NOOP" };
};

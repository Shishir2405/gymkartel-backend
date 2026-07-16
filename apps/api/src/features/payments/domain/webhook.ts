import { z } from "zod";

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

export interface OrderIntent {
  readonly orderId: string;
  readonly purpose: PaymentPurpose;
  readonly userId: string;
  readonly amountPaise: number;
  readonly ref: Readonly<Record<string, string>>;
  readonly status: "CREATED" | "PAID" | "FAILED";
  readonly createdAt: string;
}

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

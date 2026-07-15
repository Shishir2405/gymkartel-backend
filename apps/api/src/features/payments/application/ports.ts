import { Context, Effect } from "effect";
import type { DatabaseError, ExternalServiceError } from "../../../shared/errors/errors.js";
import type { PaymentVerificationError } from "../domain/errors.js";
import type { OrderIntent, PaymentPurpose, RazorpayWebhook } from "../domain/webhook.js";

export interface CreatedOrder {
  readonly orderId: string;
  readonly amountPaise: number;
  readonly currency: string;
}

/**
 * Razorpay client port (UPI-first). The live adapter talks to the Razorpay SDK;
 * the fake generates deterministic order ids for tests. Signature verification
 * lives here because only the adapter holds the webhook secret.
 */
export interface PaymentGatewayApi {
  readonly createOrder: (input: {
    readonly amountPaise: number;
    readonly receipt: string;
    readonly notes: Readonly<Record<string, string>>;
  }) => Effect.Effect<CreatedOrder, ExternalServiceError>;
  readonly verifyWebhook: (
    rawBody: string,
    signature: string,
  ) => Effect.Effect<RazorpayWebhook, PaymentVerificationError>;
}

export class PaymentGateway extends Context.Tag("features/payments/PaymentGateway")<
  PaymentGateway,
  PaymentGatewayApi
>() {}

/** Persistence for order intents — the idempotency anchor keyed by orderId. */
export interface OrderRepoApi {
  readonly create: (intent: OrderIntent) => Effect.Effect<OrderIntent, DatabaseError>;
  readonly get: (orderId: string) => Effect.Effect<OrderIntent | null, DatabaseError>;
  readonly setStatus: (
    orderId: string,
    status: OrderIntent["status"],
  ) => Effect.Effect<OrderIntent | null, DatabaseError>;
  readonly findByRef: (
    purpose: PaymentPurpose,
    ref: Readonly<Record<string, string>>,
  ) => Effect.Effect<OrderIntent | null, DatabaseError>;
}

export class OrderRepo extends Context.Tag("features/payments/OrderRepo")<
  OrderRepo,
  OrderRepoApi
>() {}

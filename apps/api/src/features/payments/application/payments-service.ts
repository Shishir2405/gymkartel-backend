import { Context, Effect, Layer } from "effect";
import { Clock } from "../../../shared/time/clock.js";
import type { DatabaseError, ExternalServiceError } from "../../../shared/errors/errors.js";
import { OrderNotFound, type PaymentVerificationError } from "../domain/errors.js";
import {
  reconcile,
  type OrderIntent,
  type PaymentPurpose,
  type Reconciliation,
} from "../domain/webhook.js";
import { OrderRepo, PaymentGateway, type CreatedOrder } from "./ports.js";

export interface WebhookOutcome {
  readonly reconciliation: Reconciliation;
  readonly intent: OrderIntent;
}

export interface PaymentsServiceApi {
  readonly createOrder: (input: {
    readonly purpose: PaymentPurpose;
    readonly userId: string;
    readonly amountPaise: number;
    readonly ref: Readonly<Record<string, string>>;
  }) => Effect.Effect<CreatedOrder, ExternalServiceError | DatabaseError>;

  readonly reconcileWebhook: (
    rawBody: string,
    signature: string,
  ) => Effect.Effect<
    WebhookOutcome,
    PaymentVerificationError | OrderNotFound | DatabaseError
  >;

  readonly isPaid: (orderId: string) => Effect.Effect<boolean, DatabaseError>;
}

export class PaymentsService extends Context.Tag("features/payments/PaymentsService")<
  PaymentsService,
  PaymentsServiceApi
>() {}

export const PaymentsServiceLive = Layer.effect(
  PaymentsService,
  Effect.gen(function* () {
    const gateway = yield* PaymentGateway;
    const orders = yield* OrderRepo;
    const clock = yield* Clock;

    return {
      createOrder: (input) =>
        Effect.gen(function* () {
          const existing = yield* orders.findByRef(input.purpose, input.ref);
          if (existing && existing.status === "CREATED") {
            return {
              orderId: existing.orderId,
              amountPaise: existing.amountPaise,
              currency: "INR",
            };
          }
          const created = yield* gateway.createOrder({
            amountPaise: input.amountPaise,
            receipt: `${input.purpose}_${input.userId}_${Date.now()}`,
            notes: { purpose: input.purpose, userId: input.userId, ...input.ref },
          });
          const now = yield* clock.now;
          yield* orders.create({
            orderId: created.orderId,
            purpose: input.purpose,
            userId: input.userId,
            amountPaise: created.amountPaise,
            ref: input.ref,
            status: "CREATED",
            createdAt: now.toISOString(),
          });
          return created;
        }),

      reconcileWebhook: (rawBody, signature) =>
        Effect.gen(function* () {
          const webhook = yield* gateway.verifyWebhook(rawBody, signature);
          const orderId =
            webhook.payload.payment?.entity.order_id ??
            webhook.payload.order?.entity.id;
          if (!orderId) {
            return yield* Effect.fail(new OrderNotFound({ orderId: "unknown" }));
          }
          const intent = yield* orders.get(orderId);
          if (!intent) return yield* Effect.fail(new OrderNotFound({ orderId }));
          const reconciliation = reconcile(intent, webhook);
          if (reconciliation.kind === "ACTIVATE") {
            yield* orders.setStatus(orderId, "PAID");
          } else if (reconciliation.kind === "MARK_FAILED") {
            yield* orders.setStatus(orderId, "FAILED");
          }
          return { reconciliation, intent };
        }),

      isPaid: (orderId) =>
        Effect.gen(function* () {
          const intent = yield* orders.get(orderId);
          return intent?.status === "PAID";
        }),
    };
  }),
);

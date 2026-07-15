import { Effect, Layer } from "effect";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { Config } from "../../../shared/config/config.js";
import { ExternalServiceError } from "../../../shared/errors/errors.js";
import { PaymentVerificationError } from "../domain/errors.js";
import { RazorpayWebhook } from "../domain/webhook.js";
import { PaymentGateway } from "../application/ports.js";

/**
 * Live Razorpay adapter (UPI-first). Order creation goes through the SDK;
 * webhook verification uses the documented HMAC-SHA256 over the RAW body with
 * the webhook secret and a constant-time comparison. Client-reported status is
 * never trusted — only this signature check plus the persisted order intent.
 */
export const PaymentGatewayLive: Layer.Layer<PaymentGateway, never, Config> =
  Layer.effect(
    PaymentGateway,
    Effect.gen(function* () {
      const config = yield* Config;
      const client = new Razorpay({
        key_id: config.razorpayKeyId,
        key_secret: config.razorpayKeySecret,
      });

      return {
        createOrder: (input) =>
          Effect.tryPromise({
            try: async () => {
              const order = await client.orders.create({
                amount: input.amountPaise,
                currency: "INR",
                receipt: input.receipt,
                notes: input.notes,
                // UPI is the default rail; Razorpay picks it up from checkout.
              });
              return {
                orderId: order.id,
                amountPaise: Number(order.amount),
                currency: order.currency,
              };
            },
            catch: (cause) =>
              new ExternalServiceError({ service: "razorpay:orders.create", cause }),
          }),

        verifyWebhook: (rawBody, signature) =>
          Effect.gen(function* () {
            const expected = createHmac("sha256", config.razorpayWebhookSecret)
              .update(rawBody)
              .digest("hex");
            const a = Buffer.from(expected);
            const b = Buffer.from(signature);
            const ok = a.length === b.length && timingSafeEqual(a, b);
            if (!ok) {
              return yield* Effect.fail(
                new PaymentVerificationError({ reason: "signature mismatch" }),
              );
            }
            const parsed = RazorpayWebhook.safeParse(JSON.parse(rawBody));
            if (!parsed.success) {
              return yield* Effect.fail(
                new PaymentVerificationError({ reason: "schema validation failed" }),
              );
            }
            return parsed.data;
          }),
      };
    }),
  );

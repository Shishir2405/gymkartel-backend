import { Effect, Layer } from "effect";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { PaymentVerificationError } from "../domain/errors.js";
import { RazorpayWebhook, type OrderIntent } from "../domain/webhook.js";
import { OrderRepo, PaymentGateway } from "../application/ports.js";

const refKey = (purpose: string, ref: Readonly<Record<string, string>>): string =>
  `${purpose}:${Object.entries(ref)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")}`;

/** Deterministic fake gateway: order ids derive from the receipt counter. */
export const PaymentGatewayMemory: Layer.Layer<PaymentGateway> = Layer.sync(
  PaymentGateway,
  () => {
    let seq = 0;
    return {
      createOrder: (input) =>
        Effect.sync(() => {
          seq += 1;
          return {
            orderId: `order_test_${seq}`,
            amountPaise: input.amountPaise,
            currency: "INR",
          };
        }),
      // In tests the "signature" is the raw body itself; parsing still runs so
      // the Zod trust boundary is exercised.
      verifyWebhook: (rawBody, signature) =>
        Effect.gen(function* () {
          if (signature !== "valid") {
            return yield* Effect.fail(
              new PaymentVerificationError({ reason: "bad signature" }),
            );
          }
          const parsed = RazorpayWebhook.safeParse(JSON.parse(rawBody));
          if (!parsed.success) {
            return yield* Effect.fail(
              new PaymentVerificationError({ reason: "malformed payload" }),
            );
          }
          return parsed.data;
        }),
    };
  },
);

export const OrderRepoMemory = (seed: readonly OrderIntent[] = []): Layer.Layer<OrderRepo> =>
  Layer.sync(OrderRepo, () => {
    const col = new InMemoryCollection<OrderIntent>((o) => o.orderId, seed);
    const byRef = new Map<string, string>();
    for (const s of seed) byRef.set(refKey(s.purpose, s.ref), s.orderId);
    return {
      create: (intent) =>
        Effect.gen(function* () {
          byRef.set(refKey(intent.purpose, intent.ref), intent.orderId);
          return yield* col.insert(intent);
        }),
      get: (orderId) => col.get(orderId),
      setStatus: (orderId, status) =>
        col.update(orderId, (o) => ({ ...o, status })),
      findByRef: (purpose, ref) =>
        Effect.gen(function* () {
          const id = byRef.get(refKey(purpose, ref));
          return id ? yield* col.get(id) : null;
        }),
    };
  });

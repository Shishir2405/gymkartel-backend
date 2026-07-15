import { Effect, Layer } from "effect";
import { z } from "zod";
import type { Filter } from "mongodb";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import type { OrderIntent, PaymentPurpose } from "../domain/webhook.js";
import { OrderRepo } from "../application/ports.js";

/**
 * Mongo-backed order-intent repository — the idempotency anchor for the money
 * path, keyed by `orderId` (unique index `uniq_order` on the `orders`
 * collection). The `OrderIntent` shape has no contract schema (it never leaves
 * the payments feature), so it is validated with a local Zod schema at this
 * boundary, exactly like the contract-backed repos.
 */
const COLLECTION = "orders";

const OrderIntentDoc = z.object({
  orderId: z.string().min(1),
  purpose: z.enum(["PASS", "TOP_UP", "BOOKING"]),
  userId: z.string().min(1),
  amountPaise: z.number().int().nonnegative(),
  ref: z.record(z.string()),
  status: z.enum(["CREATED", "PAID", "FAILED"]),
  createdAt: z.string().min(1),
});

const parseOrder = (doc: unknown): Effect.Effect<OrderIntent, DatabaseError> => {
  const r = OrderIntentDoc.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "orders.parse", cause: r.error }));
};

export const OrderRepoMongo: Layer.Layer<OrderRepo, never, Mongo> = Layer.effect(
  OrderRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<OrderIntent>(COLLECTION);
    return {
      create: (intent) =>
        parseOrder(intent).pipe(
          Effect.flatMap((valid) =>
            mongoOp("orders.create", () => col.insertOne(valid)).pipe(Effect.as(valid)),
          ),
        ),
      get: (orderId) =>
        mongoOp("orders.get", () => col.findOne({ orderId })).pipe(
          Effect.flatMap((doc) => (doc ? parseOrder(doc) : Effect.succeed(null))),
        ),
      setStatus: (orderId, status) =>
        mongoOp("orders.findForStatus", () => col.findOne({ orderId })).pipe(
          Effect.flatMap((doc) =>
            doc
              ? parseOrder(doc).pipe(
                  Effect.map((o): OrderIntent => ({ ...o, status })),
                  Effect.flatMap((next) =>
                    mongoOp("orders.setStatus", () =>
                      col.replaceOne({ orderId }, next),
                    ).pipe(Effect.as(next)),
                  ),
                )
              : Effect.succeed(null),
          ),
        ),
      findByRef: (purpose: PaymentPurpose, ref: Readonly<Record<string, string>>) => {
        // Match on purpose + every ref field (dot-notation), newest first — the
        // service only ever reuses an intent that is still CREATED.
        const filter: Filter<OrderIntent> = { purpose };
        for (const [k, v] of Object.entries(ref)) {
          (filter as Record<string, unknown>)[`ref.${k}`] = v;
        }
        return mongoOp("orders.findByRef", () =>
          col.find(filter).sort({ createdAt: -1 }).limit(1).next(),
        ).pipe(Effect.flatMap((doc) => (doc ? parseOrder(doc) : Effect.succeed(null))));
      },
    };
  }),
);

import { Context, Effect, Layer } from "effect";
import {
  PASS_PACK_DAYS,
  passPrice,
  type Pass,
  type PassId,
  type PassPack,
  type Tier,
  type UserId,
} from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import { newId } from "../../../shared/ids/ids.js";
import type { DatabaseError, ExternalServiceError } from "../../../shared/errors/errors.js";
import { PaymentsService } from "../../payments/application/payments-service.js";
import type { CreatedOrder } from "../../payments/application/ports.js";
import type { OrderIntent } from "../../payments/domain/webhook.js";
import { buildLadder, type LadderRow } from "../domain/ladder.js";
import { computeValidUntil, rolloverBonus } from "../domain/pass-rules.js";
import { PassRepo } from "./pass-repo.js";

export interface PassesServiceApi {
  readonly ladderFor: (tier: Tier) => readonly LadderRow[];
  readonly createOrder: (input: {
    readonly userId: UserId;
    readonly tier: Tier;
    readonly pack: PassPack;
  }) => Effect.Effect<CreatedOrder, ExternalServiceError | DatabaseError>;
  /**
   * Idempotently activate a pass from a paid order intent (called by the webhook
   * reconciler). Rolls unused days over from a still-valid previous pass.
   */
  readonly activateFromOrder: (
    intent: OrderIntent,
  ) => Effect.Effect<Pass, DatabaseError>;
  readonly activeForUser: (
    userId: UserId,
  ) => Effect.Effect<Pass | null, DatabaseError>;
}

export class PassesService extends Context.Tag("features/passes/PassesService")<
  PassesService,
  PassesServiceApi
>() {}

export const PassesServiceLive = Layer.effect(
  PassesService,
  Effect.gen(function* () {
    const payments = yield* PaymentsService;
    const passes = yield* PassRepo;
    const clock = yield* Clock;

    return {
      ladderFor: (tier) => buildLadder(tier),

      createOrder: (input) =>
        Effect.gen(function* () {
          const amountPaise = passPrice(input.tier, input.pack);
          return yield* payments.createOrder({
            purpose: "PASS",
            userId: input.userId,
            amountPaise,
            ref: { tier: input.tier, pack: input.pack },
          });
        }),

      activateFromOrder: (intent) =>
        Effect.gen(function* () {
          // Idempotency: if a pass already exists for this order, return it.
          const existing = yield* passes.findByOrderId(intent.orderId);
          if (existing) return existing;

          const tier = (intent.ref.tier ?? "BASIC") as Tier;
          const pack = (intent.ref.pack ?? "SINGLE_DAY") as PassPack;
          const userId = intent.userId as UserId;
          const now = yield* clock.now;

          const prior = yield* passes.activeForUser(userId);
          const bonusDays = rolloverBonus(prior, now);
          const daysTotal = PASS_PACK_DAYS[pack];
          const validUntil = computeValidUntil(now, daysTotal + bonusDays);

          const pass: Pass = {
            schemaVersion: 1,
            id: newId<PassId>("pass"),
            userId,
            tier,
            pack,
            daysTotal,
            daysUsed: 0,
            bonusDays,
            purchasedAt: now.toISOString(),
            validUntil: validUntil.toISOString(),
            status: "ACTIVE",
            orderId: intent.orderId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          // Expire the prior pass so its days don't double-count.
          if (prior) {
            yield* passes.update(prior.id, (p) => ({
              ...p,
              status: "EXPIRED",
              updatedAt: now.toISOString(),
            }));
          }
          return yield* passes.insert(pass);
        }),

      activeForUser: (userId) => passes.activeForUser(userId),
    };
  }),
);

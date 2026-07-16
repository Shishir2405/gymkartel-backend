import { Context, Effect, Layer } from "effect";
import {
  CheckInSyncInput,
  type CheckIn,
  type CheckInId,
  type GymId,
  type Paise,
  type UserId,
} from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import { newId } from "../../../shared/ids/ids.js";
import { Logger } from "../../../shared/logger/logger.js";
import {
  ValidationError,
  type DatabaseError,
  type ExternalServiceError,
  type MessageQueueError,
} from "../../../shared/errors/errors.js";
import { GymRepo } from "../../gyms/application/gym-repo.js";
import { PassRepo } from "../../passes/application/pass-repo.js";
import { PaymentsService } from "../../payments/application/payments-service.js";
import { deriveStatus } from "../../passes/domain/pass-rules.js";
import { istDayNumber } from "../../streaks-ranks/domain/ist.js";
import { resolveScan } from "../domain/resolve-scan.js";
import {
  DuplicateCheckIn,
  GymNotFound,
  NoActivePass,
  PassExpired,
  TopUpNotRequired,
  TopUpPaymentPending,
  TopUpRequired,
} from "../domain/errors.js";
import { CheckInEvents, CheckInRepo } from "./ports.js";
import type { CreatedOrder } from "../../payments/application/ports.js";

export type TopUpOrderError =
  | GymNotFound
  | NoActivePass
  | PassExpired
  | TopUpNotRequired
  | DatabaseError
  | ExternalServiceError;

export type SyncError =
  | ValidationError
  | GymNotFound
  | NoActivePass
  | PassExpired
  | TopUpRequired
  | TopUpPaymentPending
  | DuplicateCheckIn
  | DatabaseError
  | ExternalServiceError
  | MessageQueueError;

export interface CheckInServiceApi {
  readonly syncCheckIn: (
    userId: UserId,
    rawInput: unknown,
  ) => Effect.Effect<CheckIn, SyncError>;

  readonly createTopUpOrder: (
    userId: UserId,
    input: {
      readonly gymId?: string;
      readonly gymCheckInCode?: string;
      readonly idempotencyKey: string;
    },
  ) => Effect.Effect<CreatedOrder, TopUpOrderError>;

  readonly history: (
    userId: UserId,
    limit: number,
  ) => Effect.Effect<CheckIn[], DatabaseError>;
}

export class CheckInService extends Context.Tag("features/check-in/CheckInService")<
  CheckInService,
  CheckInServiceApi
>() {}

export const CheckInServiceLive = Layer.effect(
  CheckInService,
  Effect.gen(function* () {
    const gyms = yield* GymRepo;
    const passes = yield* PassRepo;
    const checkIns = yield* CheckInRepo;
    const payments = yield* PaymentsService;
    const events = yield* CheckInEvents;
    const clock = yield* Clock;
    const logger = yield* Logger;

    return {
      syncCheckIn: (userId, rawInput) =>
        Effect.gen(function* () {
          const parsed = CheckInSyncInput.safeParse(rawInput);
          if (!parsed.success) {
            return yield* Effect.fail(
              new ValidationError({
                field: "checkIn",
                message: parsed.error.issues[0]?.message ?? "invalid input",
              }),
            );
          }
          const input = parsed.data;

          const prior = yield* checkIns.findByIdempotencyKey(input.idempotencyKey);
          if (prior) return prior;

          const gym = yield* gyms.getByCheckInCode(input.gymCheckInCode);
          if (!gym) {
            return yield* Effect.fail(
              new GymNotFound({ checkInCode: input.gymCheckInCode }),
            );
          }

          const pass = yield* passes.activeForUser(userId);
          if (!pass) return yield* Effect.fail(new NoActivePass({ userId }));
          const now = yield* clock.now;
          const status = deriveStatus(pass, now);
          if (status === "EXPIRED") {
            return yield* Effect.fail(new PassExpired({ passId: pass.id }));
          }
          if (status === "EXHAUSTED") {
            return yield* Effect.fail(new NoActivePass({ userId }));
          }

          const topUpRef = { gymId: gym.id, key: input.idempotencyKey };
          const firstPass = resolveScan({
            passTier: pass.tier,
            gymTier: gym.tier,
            acceptedTopUp: input.acceptedTopUp,
            topUpPaid: false,
          });

          let topUpAmount: Paise | null = null;
          let topUpOrderId: string | null = null;

          if (firstPass.kind !== "FREE") {
            const order = yield* payments.createOrder({
              purpose: "TOP_UP",
              userId,
              amountPaise: firstPass.amountPaise,
              ref: topUpRef,
            });
            topUpOrderId = order.orderId;
            const paid = yield* payments.isPaid(order.orderId);

            if (!input.acceptedTopUp) {
              return yield* Effect.fail(
                new TopUpRequired({
                  gymTier: gym.tier,
                  passTier: pass.tier,
                  amountPaise: firstPass.amountPaise,
                  razorpayOrderId: order.orderId,
                }),
              );
            }
            if (!paid) {
              return yield* Effect.fail(
                new TopUpPaymentPending({ razorpayOrderId: order.orderId }),
              );
            }
            topUpAmount = firstPass.amountPaise;
          }

          const dayNum = istDayNumber(new Date(input.scannedAt));
          const alreadyToday = yield* checkIns.existsForUserOnDay(userId, dayNum);

          const checkIn: CheckIn = {
            schemaVersion: 1,
            id: newId<CheckInId>("chk"),
            userId,
            gymId: gym.id,
            passId: pass.id,
            gymTier: gym.tier,
            passTier: pass.tier,
            scannedAt: input.scannedAt,
            syncedAt: now.toISOString(),
            idempotencyKey: input.idempotencyKey,
            ...(topUpAmount !== null && topUpOrderId !== null
              ? { topUp: { amount: topUpAmount, orderId: topUpOrderId } }
              : {}),
            countedTowardStreak: true,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };

          const inserted = yield* checkIns.insert(checkIn).pipe(
            Effect.catchTag("DatabaseError", (e) =>
              checkIns.findByIdempotencyKey(input.idempotencyKey).pipe(
                Effect.flatMap((existing) =>
                  existing
                    ? Effect.succeed(existing)
                    : Effect.fail(e),
                ),
              ),
            ),
          );

          if (!alreadyToday) {
            yield* passes.update(pass.id, (p) => {
              const daysUsed = p.daysUsed + 1;
              const exhausted = daysUsed >= p.daysTotal + p.bonusDays;
              return {
                ...p,
                daysUsed,
                status: exhausted ? "EXHAUSTED" : p.status,
                updatedAt: now.toISOString(),
              };
            });
          }

          yield* events
            .recorded({
              checkInId: inserted.id,
              userId,
              gymId: gym.id,
              zone: gym.zone,
              scannedAt: inserted.scannedAt,
            })
            .pipe(
              Effect.catchAll((e) =>
                logger.error("checkin.recorded publish failed", { tag: e._tag }),
              ),
            );

          return inserted;
        }),

      createTopUpOrder: (userId, input) =>
        Effect.gen(function* () {
          const gym = yield* (input.gymId
            ? gyms.getById(input.gymId as GymId)
            : gyms.getByCheckInCode(input.gymCheckInCode ?? ""));
          if (!gym) {
            return yield* Effect.fail(
              new GymNotFound({
                checkInCode: input.gymCheckInCode ?? input.gymId ?? "",
              }),
            );
          }

          const pass = yield* passes.activeForUser(userId);
          if (!pass) return yield* Effect.fail(new NoActivePass({ userId }));
          const now = yield* clock.now;
          const status = deriveStatus(pass, now);
          if (status === "EXPIRED") {
            return yield* Effect.fail(new PassExpired({ passId: pass.id }));
          }
          if (status === "EXHAUSTED") {
            return yield* Effect.fail(new NoActivePass({ userId }));
          }

          const decision = resolveScan({
            passTier: pass.tier,
            gymTier: gym.tier,
            acceptedTopUp: false,
            topUpPaid: false,
          });
          if (decision.kind === "FREE") {
            return yield* Effect.fail(
              new TopUpNotRequired({ passTier: pass.tier, gymTier: gym.tier }),
            );
          }

          return yield* payments.createOrder({
            purpose: "TOP_UP",
            userId,
            amountPaise: decision.amountPaise,
            ref: { gymId: gym.id, key: input.idempotencyKey },
          });
        }),

      history: (userId, limit) => checkIns.recentForUser(userId, limit),
    };
  }),
);

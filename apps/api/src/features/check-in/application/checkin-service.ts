import { Context, Effect, Layer } from "effect";
import {
  CheckInSyncInput,
  type CheckIn,
  type CheckInId,
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
  TopUpPaymentPending,
  TopUpRequired,
} from "../domain/errors.js";
import { CheckInEvents, CheckInRepo } from "./ports.js";

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
  /**
   * Sync one (possibly offline-queued) check-in. The SERVER is the reconciler:
   * idempotent on `idempotencyKey`, so retries/duplicates/replay all collapse
   * to a single stored check-in. Resolves gym, tier, top-up and day-consumption.
   */
  readonly syncCheckIn: (
    userId: UserId,
    rawInput: unknown,
  ) => Effect.Effect<CheckIn, SyncError>;

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

          // 1. Idempotency: a prior sync with this key wins — return it as-is.
          const prior = yield* checkIns.findByIdempotencyKey(input.idempotencyKey);
          if (prior) return prior;

          // 2. Resolve the gym from the scanned QR payload.
          const gym = yield* gyms.getByCheckInCode(input.gymCheckInCode);
          if (!gym) {
            return yield* Effect.fail(
              new GymNotFound({ checkInCode: input.gymCheckInCode }),
            );
          }

          // 3. Require a usable pass.
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

          // 4. Top-up resolution (Flow 4). The order is the idempotency anchor.
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
            // A delta is due — create/reuse the Razorpay order for it.
            const order = yield* payments.createOrder({
              purpose: "TOP_UP",
              userId,
              amountPaise: firstPass.amountPaise,
              ref: topUpRef,
            });
            topUpOrderId = order.orderId;
            const paid = yield* payments.isPaid(order.orderId);

            if (!input.acceptedTopUp) {
              // Never a wall: surface the sheet with cost + order.
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

          // 5. Record the check-in. Consume a pass DAY only once per IST day.
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
              // Unique-key race on idempotencyKey → treat as duplicate success.
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

          // 6. Fan out for streak/rank/share-card. Failure here must not fail
          // the check-in (the heartbeat already happened) — log and move on.
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

      history: (userId, limit) => checkIns.recentForUser(userId, limit),
    };
  }),
);

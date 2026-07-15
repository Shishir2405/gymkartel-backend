import { z } from "zod";
import {
  CheckInId,
  GymId,
  Paise,
  PassId,
  Tier,
  Timestamps,
  UserId,
  schemaVersion,
} from "./common.js";

/**
 * A single check-in. This is the heartbeat aggregate — everything downstream
 * (streaks, ranks, leaderboards, share cards) is derived from the stream of
 * these documents.
 *
 * `idempotencyKey` is generated on-device at scan time so an offline scan that
 * gets retried during sync collapses to one check-in. It is the unique key the
 * server dedupes on.
 */
export const CheckIn = z.object({
  schemaVersion: schemaVersion(1),
  id: CheckInId,
  userId: UserId,
  gymId: GymId,
  passId: PassId,
  /** Gym tier at time of scan. Differs from pass tier when a top-up happened. */
  gymTier: Tier,
  passTier: Tier,
  /** Client-authoritative scan time (offline-safe); server records receipt too. */
  scannedAt: z.string().datetime({ offset: true }),
  syncedAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(8),
  topUp: z
    .object({
      amount: Paise,
      orderId: z.string().min(1),
    })
    .optional(),
  /** Set true when this scan created/extended the streak on the derived side. */
  countedTowardStreak: z.boolean().default(true),
}).merge(Timestamps);
export type CheckIn = z.infer<typeof CheckIn>;

/**
 * The payload the device sends to sync one (possibly offline-queued) check-in.
 * Deliberately minimal — the server resolves tier/top-up/streak, the client
 * only asserts "I scanned this code at this time with this idempotency key".
 */
export const CheckInSyncInput = z.object({
  gymCheckInCode: z.string().min(1),
  scannedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8),
  /** Present only when the user confirmed a top-up in the scanner sheet. */
  acceptedTopUp: z.boolean().default(false),
});
export type CheckInSyncInput = z.infer<typeof CheckInSyncInput>;

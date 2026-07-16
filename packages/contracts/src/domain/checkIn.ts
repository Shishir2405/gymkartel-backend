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

export const CheckIn = z.object({
  schemaVersion: schemaVersion(1),
  id: CheckInId,
  userId: UserId,
  gymId: GymId,
  passId: PassId,
  gymTier: Tier,
  passTier: Tier,
  scannedAt: z.string().datetime({ offset: true }),
  syncedAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(8),
  topUp: z
    .object({
      amount: Paise,
      orderId: z.string().min(1),
    })
    .optional(),
  countedTowardStreak: z.boolean().default(true),
}).merge(Timestamps);
export type CheckIn = z.infer<typeof CheckIn>;

export const CheckInSyncInput = z.object({
  gymCheckInCode: z.string().min(1),
  scannedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8),
  acceptedTopUp: z.boolean().default(false),
});
export type CheckInSyncInput = z.infer<typeof CheckInSyncInput>;

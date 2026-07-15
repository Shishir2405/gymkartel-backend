import { z } from "zod";
import {
  PassId,
  Tier,
  Timestamps,
  UserId,
  schemaVersion,
} from "./common.js";

/**
 * Pack lengths sold on the pass ladder (Flow 2). The 7-day pack is the decoy —
 * it exists to make 15-day look obviously right. Ordering/labels live in
 * `pricing.ts`, the numbers here are just the identity of each pack.
 */
export const PassPack = z.enum(["SINGLE_DAY", "SEVEN_DAY", "FIFTEEN_DAY", "THIRTY_DAY"]);
export type PassPack = z.infer<typeof PassPack>;

export const PASS_PACK_DAYS: Record<PassPack, number> = {
  SINGLE_DAY: 1,
  SEVEN_DAY: 7,
  FIFTEEN_DAY: 15,
  THIRTY_DAY: 30,
};

/**
 * A purchased pass. Days are consumed one-per-check-in-day (not per scan — a
 * top-up scan at a higher-tier gym spends one day + the top-up delta). Unused
 * days roll over inside the validity window (the "your days wait for you" line).
 */
export const Pass = z.object({
  schemaVersion: schemaVersion(1),
  id: PassId,
  userId: UserId,
  tier: Tier,
  pack: PassPack,
  daysTotal: z.number().int().positive(),
  daysUsed: z.number().int().nonnegative(),
  /** Bonus days earned from streak weeks, granted onto the active pass. */
  bonusDays: z.number().int().nonnegative().default(0),
  purchasedAt: z.string().datetime({ offset: true }),
  /** Window close — days are forfeit after this even if unused. */
  validUntil: z.string().datetime({ offset: true }),
  status: z.enum(["ACTIVE", "EXPIRED", "EXHAUSTED"]),
  /** Razorpay order id that funded this pass — for reconciliation. */
  orderId: z.string().min(1),
}).merge(Timestamps);
export type Pass = z.infer<typeof Pass>;

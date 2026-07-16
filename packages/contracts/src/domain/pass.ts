import { z } from "zod";
import {
  PassId,
  Tier,
  Timestamps,
  UserId,
  schemaVersion,
} from "./common.js";

export const PassPack = z.enum(["SINGLE_DAY", "SEVEN_DAY", "FIFTEEN_DAY", "THIRTY_DAY"]);
export type PassPack = z.infer<typeof PassPack>;

export const PASS_PACK_DAYS: Record<PassPack, number> = {
  SINGLE_DAY: 1,
  SEVEN_DAY: 7,
  FIFTEEN_DAY: 15,
  THIRTY_DAY: 30,
};

export const Pass = z.object({
  schemaVersion: schemaVersion(1),
  id: PassId,
  userId: UserId,
  tier: Tier,
  pack: PassPack,
  daysTotal: z.number().int().positive(),
  daysUsed: z.number().int().nonnegative(),
  bonusDays: z.number().int().nonnegative().default(0),
  purchasedAt: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
  status: z.enum(["ACTIVE", "EXPIRED", "EXHAUSTED"]),
  orderId: z.string().min(1),
}).merge(Timestamps);
export type Pass = z.infer<typeof Pass>;

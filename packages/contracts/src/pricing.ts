import type { PassPack } from "./domain/pass.js";
import { PASS_PACK_DAYS } from "./domain/pass.js";
import type { Paise, Tier } from "./domain/common.js";
import { TIER_RANK } from "./domain/common.js";

const paise = (rupees: number): Paise => (rupees * 100) as Paise;

export const TIER_DAY_RATE: Record<Tier, Paise> = {
  BASIC: paise(99),
  STANDARD: paise(149),
  PREMIUM: paise(199),
};

const PACK_DISCOUNT: Record<PassPack, number> = {
  SINGLE_DAY: 1.0,
  SEVEN_DAY: 0.97,
  FIFTEEN_DAY: 0.85,
  THIRTY_DAY: 0.75,
};

export const passPrice = (tier: Tier, pack: PassPack): Paise => {
  const perDay = TIER_DAY_RATE[tier] * PACK_DISCOUNT[pack];
  return (Math.round(perDay) * PASS_PACK_DAYS[pack]) as Paise;
};

export const passPerDayPrice = (tier: Tier, pack: PassPack): Paise =>
  Math.round(passPrice(tier, pack) / PASS_PACK_DAYS[pack]) as Paise;

export type PassPackLadderRow = {
  pack: PassPack;
  days: number;
  badge?: "MOST_CHOSEN" | "BEST_RATE";
  rankMultiplier?: number;
  emphasized?: boolean;
};

export const PASS_LADDER: readonly PassPackLadderRow[] = [
  { pack: "SINGLE_DAY", days: 1 },
  { pack: "SEVEN_DAY", days: 7 },
  { pack: "FIFTEEN_DAY", days: 15, badge: "MOST_CHOSEN", emphasized: true },
  { pack: "THIRTY_DAY", days: 30, badge: "BEST_RATE", rankMultiplier: 2 },
];

export const topUpCost = (passTier: Tier, gymTier: Tier): Paise | null => {
  const delta = TIER_RANK[gymTier] - TIER_RANK[passTier];
  if (delta <= 0) return null;

  const key = `${passTier}->${gymTier}` as const;
  const matrix: Partial<Record<string, Paise>> = {
    "BASIC->STANDARD": paise(59),
    "STANDARD->PREMIUM": paise(59),
    "BASIC->PREMIUM": paise(99),
  };
  return matrix[key] ?? null;
};

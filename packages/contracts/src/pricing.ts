import type { PassPack } from "./domain/pass.js";
import { PASS_PACK_DAYS } from "./domain/pass.js";
import type { Paise, Tier } from "./domain/common.js";
import { TIER_RANK } from "./domain/common.js";

/**
 * SINGLE SOURCE OF TRUTH for all pass & top-up money (brief principle #6).
 *
 * The backend's pricing service imports these; the app imports them only to
 * DISPLAY prices. No price is ever hardcoded at a call site. Values are paise.
 *
 * Pack prices are derived from a per-day base rate so the ladder maths stay
 * internally consistent and the "decoy" (7-day) is visibly worse per-day than
 * 15-day, which is the whole point of Flow 2.
 */

const paise = (rupees: number): Paise => (rupees * 100) as Paise;

/** Per-day headline rate by tier — the ₹99 / ₹149 / ₹199 from onboarding. */
export const TIER_DAY_RATE: Record<Tier, Paise> = {
  BASIC: paise(99),
  STANDARD: paise(149),
  PREMIUM: paise(199),
};

/**
 * Per-day rate actually charged for each pack. Longer packs get cheaper per day;
 * the 7-day decoy is only a hair cheaper than single-day so 15/30 look right.
 */
const PACK_DISCOUNT: Record<PassPack, number> = {
  SINGLE_DAY: 1.0,
  SEVEN_DAY: 0.97, // decoy: barely a discount
  FIFTEEN_DAY: 0.85, // MOST CHOSEN
  THIRTY_DAY: 0.75, // BEST RATE
};

export const passPrice = (tier: Tier, pack: PassPack): Paise => {
  const perDay = TIER_DAY_RATE[tier] * PACK_DISCOUNT[pack];
  return (Math.round(perDay) * PASS_PACK_DAYS[pack]) as Paise;
};

export const passPerDayPrice = (tier: Tier, pack: PassPack): Paise =>
  Math.round(passPrice(tier, pack) / PASS_PACK_DAYS[pack]) as Paise;

/** Presentation metadata for the pass ladder — one badge, decoy stays plain. */
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

/**
 * Top-up delta when a member scans a gym above their pass tier (Flow 4).
 * Higher-tier passes enter lower-tier gyms free, so those pairs are 0.
 * Returns null for same-tier (no sheet at all).
 */
export const topUpCost = (passTier: Tier, gymTier: Tier): Paise | null => {
  const delta = TIER_RANK[gymTier] - TIER_RANK[passTier];
  if (delta <= 0) return null; // same or lower gym tier → free, no sheet

  // Explicit matrix per spec: Basic→Standard 59, Standard→Premium 59, Basic→Premium 99.
  const key = `${passTier}->${gymTier}` as const;
  const matrix: Partial<Record<string, Paise>> = {
    "BASIC->STANDARD": paise(59),
    "STANDARD->PREMIUM": paise(59),
    "BASIC->PREMIUM": paise(99),
  };
  return matrix[key] ?? null;
};

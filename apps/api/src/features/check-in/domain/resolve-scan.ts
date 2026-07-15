import { TIER_RANK, topUpCost, type Paise, type Tier } from "@gymkartel/contracts";

/**
 * Pure decision for a single scan given the pass tier and the scanned gym's
 * tier. Encodes Flow 3/4:
 *  - gym tier <= pass tier  → FREE (higher/equal pass scans free)
 *  - gym tier  > pass tier  → a top-up delta is due; the outcome depends on
 *    whether the member accepted the sheet and whether the payment cleared.
 *
 * No side effects — the application layer turns TOP_UP_REQUIRED into a Razorpay
 * order and the tagged error, and FREE/TOP_UP_SETTLED into a persisted check-in.
 */
export type ScanDecision =
  | { readonly kind: "FREE" }
  | { readonly kind: "TOP_UP_REQUIRED"; readonly amountPaise: Paise; readonly gymTier: Tier }
  | { readonly kind: "TOP_UP_PENDING"; readonly amountPaise: Paise; readonly gymTier: Tier }
  | { readonly kind: "TOP_UP_SETTLED"; readonly amountPaise: Paise; readonly gymTier: Tier };

export interface ScanContext {
  readonly passTier: Tier;
  readonly gymTier: Tier;
  /** The member tapped "accept top-up" in the scanner sheet. */
  readonly acceptedTopUp: boolean;
  /** The Razorpay order for the top-up has been captured (webhook reconciled). */
  readonly topUpPaid: boolean;
}

export const resolveScan = (ctx: ScanContext): ScanDecision => {
  const needsTopUp = TIER_RANK[ctx.gymTier] > TIER_RANK[ctx.passTier];
  if (!needsTopUp) return { kind: "FREE" };

  const cost = topUpCost(ctx.passTier, ctx.gymTier);
  // Defensive: if the matrix has no entry (shouldn't happen for valid tiers),
  // treat as free rather than blocking the member at the door.
  if (cost === null) return { kind: "FREE" };

  if (!ctx.acceptedTopUp) {
    return { kind: "TOP_UP_REQUIRED", amountPaise: cost, gymTier: ctx.gymTier };
  }
  if (!ctx.topUpPaid) {
    return { kind: "TOP_UP_PENDING", amountPaise: cost, gymTier: ctx.gymTier };
  }
  return { kind: "TOP_UP_SETTLED", amountPaise: cost, gymTier: ctx.gymTier };
};

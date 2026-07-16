import { TIER_RANK, topUpCost, type Paise, type Tier } from "@gymkartel/contracts";

export type ScanDecision =
  | { readonly kind: "FREE" }
  | { readonly kind: "TOP_UP_REQUIRED"; readonly amountPaise: Paise; readonly gymTier: Tier }
  | { readonly kind: "TOP_UP_PENDING"; readonly amountPaise: Paise; readonly gymTier: Tier }
  | { readonly kind: "TOP_UP_SETTLED"; readonly amountPaise: Paise; readonly gymTier: Tier };

export interface ScanContext {
  readonly passTier: Tier;
  readonly gymTier: Tier;
  readonly acceptedTopUp: boolean;
  readonly topUpPaid: boolean;
}

export const resolveScan = (ctx: ScanContext): ScanDecision => {
  const needsTopUp = TIER_RANK[ctx.gymTier] > TIER_RANK[ctx.passTier];
  if (!needsTopUp) return { kind: "FREE" };

  const cost = topUpCost(ctx.passTier, ctx.gymTier);
  if (cost === null) return { kind: "FREE" };

  if (!ctx.acceptedTopUp) {
    return { kind: "TOP_UP_REQUIRED", amountPaise: cost, gymTier: ctx.gymTier };
  }
  if (!ctx.topUpPaid) {
    return { kind: "TOP_UP_PENDING", amountPaise: cost, gymTier: ctx.gymTier };
  }
  return { kind: "TOP_UP_SETTLED", amountPaise: cost, gymTier: ctx.gymTier };
};

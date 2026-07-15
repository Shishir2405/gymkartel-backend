import { Data } from "effect";
import type { Paise, Tier } from "@gymkartel/contracts";

/** Tagged errors for the check-in heartbeat. All boundaries return these. */

export class NoActivePass extends Data.TaggedError("NoActivePass")<{
  readonly userId: string;
}> {}

export class PassExpired extends Data.TaggedError("PassExpired")<{
  readonly passId: string;
}> {}

export class GymNotFound extends Data.TaggedError("GymNotFound")<{
  readonly checkInCode: string;
}> {}

export class DuplicateCheckIn extends Data.TaggedError("DuplicateCheckIn")<{
  readonly idempotencyKey: string;
  readonly checkInId: string;
}> {}

/**
 * The gym is above the pass tier and the member has not paid the top-up yet.
 * Carries the delta cost + a created Razorpay order so the app can present a
 * one-tap sheet — never a wall (Flow 4).
 */
export class TopUpRequired extends Data.TaggedError("TopUpRequired")<{
  readonly gymTier: Tier;
  readonly passTier: Tier;
  readonly amountPaise: Paise;
  readonly razorpayOrderId: string;
}> {}

/** Member accepted the top-up but the Razorpay payment hasn't been captured. */
export class TopUpPaymentPending extends Data.TaggedError("TopUpPaymentPending")<{
  readonly razorpayOrderId: string;
}> {}

/**
 * The gym is at or below the pass tier, so no top-up delta is due — asking for a
 * top-up order here is a no-op the app should never reach (it only opens UPI
 * checkout when a scan surfaced `topUpRequired`).
 */
export class TopUpNotRequired extends Data.TaggedError("TopUpNotRequired")<{
  readonly passTier: Tier;
  readonly gymTier: Tier;
}> {}

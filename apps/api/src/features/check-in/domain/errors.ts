import { Data } from "effect";
import type { Paise, Tier } from "@gymkartel/contracts";

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

export class TopUpRequired extends Data.TaggedError("TopUpRequired")<{
  readonly gymTier: Tier;
  readonly passTier: Tier;
  readonly amountPaise: Paise;
  readonly razorpayOrderId: string;
}> {}

export class TopUpPaymentPending extends Data.TaggedError("TopUpPaymentPending")<{
  readonly razorpayOrderId: string;
}> {}

export class TopUpNotRequired extends Data.TaggedError("TopUpNotRequired")<{
  readonly passTier: Tier;
  readonly gymTier: Tier;
}> {}

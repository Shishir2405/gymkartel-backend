import { Data } from "effect";

export class PaymentVerificationError extends Data.TaggedError(
  "PaymentVerificationError",
)<{ readonly reason: string }> {}

export class OrderNotFound extends Data.TaggedError("OrderNotFound")<{
  readonly orderId: string;
}> {}

export class DuplicateWebhook extends Data.TaggedError("DuplicateWebhook")<{
  readonly orderId: string;
}> {}

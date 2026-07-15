import { Data } from "effect";

export class InvalidOtpError extends Data.TaggedError("InvalidOtpError")<{
  readonly attemptsLeft: number;
}> {}

export class OtpExpiredError extends Data.TaggedError("OtpExpiredError")<{
  readonly phone: string;
}> {}

import { Data } from "effect";

export class BookingNotFound extends Data.TaggedError("BookingNotFound")<{
  readonly bookingId: string;
}> {}

export class SlotUnavailable extends Data.TaggedError("SlotUnavailable")<{
  readonly coachId: string;
  readonly scheduledFor: string;
}> {}

export class AlreadyCancelled extends Data.TaggedError("AlreadyCancelled")<{
  readonly bookingId: string;
}> {}

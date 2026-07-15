import { Data } from "effect";

export class CoachNotFound extends Data.TaggedError("CoachNotFound")<{
  readonly coachId: string;
}> {}

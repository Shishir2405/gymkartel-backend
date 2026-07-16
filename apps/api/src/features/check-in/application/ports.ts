import { Context, Effect } from "effect";
import type { CheckIn, UserId } from "@gymkartel/contracts";
import type { DatabaseError, MessageQueueError } from "../../../shared/errors/errors.js";

export interface CheckInRepoApi {
  readonly findByIdempotencyKey: (
    key: string,
  ) => Effect.Effect<CheckIn | null, DatabaseError>;
  readonly existsForUserOnDay: (
    userId: UserId,
    istDayNumber: number,
  ) => Effect.Effect<boolean, DatabaseError>;
  readonly insert: (checkIn: CheckIn) => Effect.Effect<CheckIn, DatabaseError>;
  readonly recentForUser: (
    userId: UserId,
    limit: number,
  ) => Effect.Effect<CheckIn[], DatabaseError>;
  readonly allInstantsForUser: (
    userId: UserId,
  ) => Effect.Effect<Date[], DatabaseError>;
}

export class CheckInRepo extends Context.Tag("features/check-in/CheckInRepo")<
  CheckInRepo,
  CheckInRepoApi
>() {}

export interface CheckinRecordedEvent {
  readonly checkInId: string;
  readonly userId: string;
  readonly gymId: string;
  readonly zone: string;
  readonly scannedAt: string;
}

export interface CheckInEventsApi {
  readonly recorded: (
    event: CheckinRecordedEvent,
  ) => Effect.Effect<void, MessageQueueError>;
}

export class CheckInEvents extends Context.Tag("features/check-in/CheckInEvents")<
  CheckInEvents,
  CheckInEventsApi
>() {}

import { Effect, Layer } from "effect";
import type { CheckIn } from "@gymkartel/contracts";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { istDayNumber } from "../../streaks-ranks/domain/ist.js";
import {
  CheckInEvents,
  CheckInRepo,
  type CheckinRecordedEvent,
} from "../application/ports.js";

export const CheckInRepoMemory = (
  seed: readonly CheckIn[] = [],
): Layer.Layer<CheckInRepo> =>
  Layer.sync(CheckInRepo, () => {
    const col = new InMemoryCollection<CheckIn>((c) => c.id, seed);
    return {
      findByIdempotencyKey: (key) =>
        col.find((c) => c.idempotencyKey === key),
      existsForUserOnDay: (userId, dayNumber) =>
        Effect.gen(function* () {
          const found = yield* col.find(
            (c) =>
              c.userId === userId &&
              istDayNumber(new Date(c.scannedAt)) === dayNumber,
          );
          return found !== null;
        }),
      insert: (checkIn) => col.insert(checkIn),
      recentForUser: (userId, limit) =>
        Effect.gen(function* () {
          const rows = yield* col.filter((c) => c.userId === userId);
          rows.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
          return rows.slice(0, limit);
        }),
      allInstantsForUser: (userId) =>
        Effect.gen(function* () {
          const rows = yield* col.filter((c) => c.userId === userId);
          return rows.map((c) => new Date(c.scannedAt));
        }),
    };
  });

export class CheckInEventRecorder {
  readonly events: CheckinRecordedEvent[] = [];
}

export const CheckInEventsMemory = (
  recorder: CheckInEventRecorder = new CheckInEventRecorder(),
): Layer.Layer<CheckInEvents> =>
  Layer.succeed(CheckInEvents, {
    recorded: (event) =>
      Effect.sync(() => {
        recorder.events.push(event);
      }),
  });

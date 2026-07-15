import { Context, Effect, Layer } from "effect";
import type { CoachId, UserId } from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import { newId } from "../../../shared/ids/ids.js";
import type { DatabaseError } from "../../../shared/errors/errors.js";
import { parseWorkout, isPersonalRecord, type WorkoutEntry } from "../domain/parser.js";

export interface LoggedEntry {
  readonly id: string;
  readonly userId: UserId;
  readonly entry: WorkoutEntry;
  readonly isPR: boolean;
  /** Set when a coach logged this session on the member's behalf. */
  readonly coachId: CoachId | null;
  readonly loggedAt: string;
}

export interface LedgerRepoApi {
  readonly append: (entry: LoggedEntry) => Effect.Effect<LoggedEntry, DatabaseError>;
  readonly forUser: (userId: UserId) => Effect.Effect<LoggedEntry[], DatabaseError>;
  /** Best strength weight logged for an exercise (for PR detection). */
  readonly bestWeight: (
    userId: UserId,
    exercise: string,
  ) => Effect.Effect<number | null, DatabaseError>;
}

export class LedgerRepo extends Context.Tag("features/ledger/LedgerRepo")<
  LedgerRepo,
  LedgerRepoApi
>() {}

export interface LedgerServiceApi {
  /**
   * Parse free text into structured entries (amber `?` on uncertain tokens,
   * never a silent guess) and persist them, flagging personal records.
   * `coachId` is set when a coach logs the session for the member.
   */
  readonly log: (
    userId: UserId,
    text: string,
    coachId?: CoachId,
  ) => Effect.Effect<LoggedEntry[], DatabaseError>;
  readonly history: (
    userId: UserId,
    exercise?: string,
  ) => Effect.Effect<LoggedEntry[], DatabaseError>;
}

export class LedgerService extends Context.Tag("features/ledger/LedgerService")<
  LedgerService,
  LedgerServiceApi
>() {}

export const LedgerServiceLive = Layer.effect(
  LedgerService,
  Effect.gen(function* () {
    const repo = yield* LedgerRepo;
    const clock = yield* Clock;

    return {
      log: (userId, text, coachId) =>
        Effect.gen(function* () {
          const now = yield* clock.now;
          const parsed = parseWorkout(text);
          const out: LoggedEntry[] = [];
          for (const entry of parsed) {
            let isPR = false;
            if (entry.kind === "STRENGTH") {
              const best = yield* repo.bestWeight(userId, entry.exercise);
              isPR = isPersonalRecord(entry.weightKg, best);
            }
            const logged = yield* repo.append({
              id: newId<string>("led"),
              userId,
              entry,
              isPR,
              coachId: coachId ?? null,
              loggedAt: now.toISOString(),
            });
            out.push(logged);
          }
          return out;
        }),

      history: (userId, exercise) =>
        Effect.gen(function* () {
          const rows = yield* repo.forUser(userId);
          if (!exercise) return rows;
          return rows.filter(
            (r) => "exercise" in r.entry && r.entry.exercise === exercise,
          );
        }),
    };
  }),
);

export const LedgerRepoMemory: Layer.Layer<LedgerRepo> = Layer.sync(LedgerRepo, () => {
  const rows: LoggedEntry[] = [];
  return {
    append: (entry) =>
      Effect.sync(() => {
        rows.push(entry);
        return entry;
      }),
    forUser: (userId) =>
      Effect.sync(() =>
        rows
          .filter((r) => r.userId === userId)
          .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
      ),
    bestWeight: (userId, exercise) =>
      Effect.sync(() => {
        let best: number | null = null;
        for (const r of rows) {
          if (r.userId !== userId) continue;
          if (r.entry.kind === "STRENGTH" && r.entry.exercise === exercise) {
            if (r.entry.weightKg !== null && (best === null || r.entry.weightKg > best)) {
              best = r.entry.weightKg;
            }
          }
        }
        return best;
      }),
  };
});

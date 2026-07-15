import { Context, Effect, Layer } from "effect";
import type { UserId } from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import type { DatabaseError } from "../../../shared/errors/errors.js";
import { CheckInRepo } from "../../check-in/application/ports.js";
import { PassRepo } from "../../passes/application/pass-repo.js";
import { computeStreak, bonusDaysToGrant, type StreakState } from "../domain/streak.js";
import { rankForWeeks, type RankProgress } from "../domain/rank.js";

export interface ViewerStreak {
  readonly state: StreakState;
  readonly rank: RankProgress;
}

export interface StreaksServiceApi {
  readonly forUser: (
    userId: UserId,
  ) => Effect.Effect<ViewerStreak, DatabaseError>;
  /**
   * Recompute streak from the full check-in history and grant any newly-earned
   * bonus days onto the active pass. Idempotent: re-running grants nothing extra
   * (bonusDaysToGrant compares against what the pass already holds). This is the
   * body of the `checkin.recorded` streak-recompute worker.
   */
  readonly recomputeAndGrant: (
    userId: UserId,
  ) => Effect.Effect<ViewerStreak, DatabaseError>;
}

export class StreaksService extends Context.Tag("features/streaks-ranks/StreaksService")<
  StreaksService,
  StreaksServiceApi
>() {}

export const StreaksServiceLive = Layer.effect(
  StreaksService,
  Effect.gen(function* () {
    const checkIns = yield* CheckInRepo;
    const passes = yield* PassRepo;
    const clock = yield* Clock;

    const compute = (userId: UserId) =>
      Effect.gen(function* () {
        const instants = yield* checkIns.allInstantsForUser(userId);
        const now = yield* clock.now;
        const state = computeStreak(instants, now);
        return { state, rank: rankForWeeks(state.weeks) };
      });

    return {
      forUser: (userId) => compute(userId),
      recomputeAndGrant: (userId) =>
        Effect.gen(function* () {
          const result = yield* compute(userId);
          const pass = yield* passes.activeForUser(userId);
          if (pass) {
            // Track granted bonus in the pass's bonusDays; grant the delta only.
            const toGrant = bonusDaysToGrant(result.state.weeks, pass.bonusDays);
            if (toGrant > 0) {
              const now = yield* clock.now;
              yield* passes.update(pass.id, (p) => ({
                ...p,
                bonusDays: p.bonusDays + toGrant,
                updatedAt: now.toISOString(),
              }));
            }
          }
          return result;
        }),
    };
  }),
);

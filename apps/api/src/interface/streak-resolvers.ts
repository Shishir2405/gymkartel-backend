import { Effect } from "effect";
import { StreaksService } from "../features/streaks-ranks/application/streaks-service.js";
import { CheckInRepo } from "../features/check-in/application/ports.js";
import { RANKS } from "../features/streaks-ranks/domain/rank.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

/** The public rank ladder — surfaced verbatim so a member sees the next target. */
const publicThresholds = RANKS.map((r) => ({
  key: r.key,
  label: r.label,
  minWeeks: r.minWeeks,
}));

/**
 * Streaks & ranks. Reuses the SAME StreaksService the `Viewer.streak` resolver
 * uses (no duplicate streak maths) and exposes the public rank thresholds. The
 * calendar's `days` come straight from the check-in instants port.
 */
export const streakResolvers = {
  Query: {
    rankCard: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        StreaksService.pipe(
          Effect.flatMap((s) => s.forUser(viewer.id)),
          Effect.map((vs) => ({
            current: vs.rank.current,
            label: vs.rank.label,
            next: vs.rank.next,
            weeksToNext: vs.rank.weeksToNext,
            streakWeeks: vs.state.weeks,
            thresholds: publicThresholds,
          })),
        ),
      );
    },

    streakCalendar: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const streaks = yield* StreaksService;
          const checkIns = yield* CheckInRepo;
          const vs = yield* streaks.forUser(viewer.id);
          const instants = yield* checkIns.allInstantsForUser(viewer.id);
          const days = [...instants]
            .map((d) => d.toISOString())
            .sort((a, b) => a.localeCompare(b));
          return {
            weeks: vs.state.weeks,
            alive: vs.state.alive,
            daysThisWindow: vs.state.daysThisWindow,
            windowDaysLeft: vs.state.windowDaysLeft,
            bonusDaysEarned: vs.state.bonusDaysEarned,
            days,
          };
        }),
      );
    },
  },
};

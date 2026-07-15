import { Effect } from "effect";
import {
  LeaderboardService,
  type Segment,
} from "../features/leaderboards/application/leaderboard-service.js";
import { UserRepo } from "../features/onboarding/application/user-repo.js";
import { Clock } from "../shared/time/clock.js";
import { istSeasonKey } from "../features/streaks-ranks/domain/ist.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

/**
 * Leaderboards. Ranking is attendance-only (streak, then check-ins) — the
 * service enforces that; the resolver only picks the scopeKey (defaulting to the
 * viewer's zone/state) and stamps the current IST season onto the result.
 */
export const leaderboardResolvers = {
  Query: {
    leaderboard: (
      _p: unknown,
      args: { segment: Segment; scopeKey?: string | null; limit?: number | null },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const users = yield* UserRepo;
          const svc = yield* LeaderboardService;
          const clock = yield* Clock;
          const now = yield* clock.now;
          const me = yield* users.findById(viewer.id);
          const scopeKey =
            args.scopeKey ??
            (args.segment === "ZONE"
              ? (me?.zone ?? "")
              : args.segment === "STATE"
                ? (me?.state ?? "")
                : "INDIA");
          const view = yield* svc.view({
            segment: args.segment,
            scopeKey,
            selfUserId: viewer.id,
            ...(args.limit != null ? { limit: args.limit } : {}),
          });
          return {
            segment: args.segment,
            scopeKey,
            season: istSeasonKey(now),
            page: view.page,
            self: view.self,
          };
        }),
      );
    },
  },
};

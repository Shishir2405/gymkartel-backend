import { Context, Effect, Layer } from "effect";
import type { UserId } from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import type { DatabaseError } from "../../../shared/errors/errors.js";
import { istSeasonKey } from "../../streaks-ranks/domain/ist.js";
import {
  buildView,
  type LeaderboardEntry,
  type LeaderboardView,
} from "../domain/ranking.js";

export type Segment = "ZONE" | "STATE" | "INDIA";

export interface StoredLeaderboardRow extends LeaderboardEntry {
  readonly segment: Segment;
  readonly scopeKey: string; // zone id / state id / "INDIA"
  readonly season: string; // IST month YYYY-MM
}

export interface LeaderboardRepoApi {
  readonly upsert: (
    row: StoredLeaderboardRow,
  ) => Effect.Effect<void, DatabaseError>;
  readonly rows: (
    segment: Segment,
    scopeKey: string,
    season: string,
  ) => Effect.Effect<StoredLeaderboardRow[], DatabaseError>;
}

export class LeaderboardRepo extends Context.Tag(
  "features/leaderboards/LeaderboardRepo",
)<LeaderboardRepo, LeaderboardRepoApi>() {}

export interface LeaderboardServiceApi {
  /**
   * Ranked view for a segment (ZONE/STATE/INDIA) in the CURRENT monthly season,
   * with a sticky self-row. Ranking is attendance-only (streak, then check-ins)
   * — money never influences position.
   */
  readonly view: (input: {
    readonly segment: Segment;
    readonly scopeKey: string;
    readonly selfUserId: UserId;
    readonly limit?: number;
  }) => Effect.Effect<LeaderboardView, DatabaseError>;
  readonly record: (
    row: Omit<StoredLeaderboardRow, "season">,
  ) => Effect.Effect<void, DatabaseError>;
}

export class LeaderboardService extends Context.Tag(
  "features/leaderboards/LeaderboardService",
)<LeaderboardService, LeaderboardServiceApi>() {}

export const LeaderboardServiceLive = Layer.effect(
  LeaderboardService,
  Effect.gen(function* () {
    const repo = yield* LeaderboardRepo;
    const clock = yield* Clock;

    return {
      view: (input) =>
        Effect.gen(function* () {
          const now = yield* clock.now;
          const season = istSeasonKey(now);
          const rows = yield* repo.rows(input.segment, input.scopeKey, season);
          return buildView(rows, input.selfUserId, input.limit ?? 50);
        }),
      record: (row) =>
        Effect.gen(function* () {
          const now = yield* clock.now;
          yield* repo.upsert({ ...row, season: istSeasonKey(now) });
        }),
    };
  }),
);

const key = (
  r: Pick<StoredLeaderboardRow, "segment" | "scopeKey" | "season" | "userId">,
) => `${r.segment}:${r.scopeKey}:${r.season}:${r.userId}`;

/** Factory variant that pre-seeds rows (used by the infra-free runtime). */
export const LeaderboardRepoMemorySeeded = (
  seed: readonly StoredLeaderboardRow[] = [],
): Layer.Layer<LeaderboardRepo> =>
  Layer.sync(LeaderboardRepo, () => {
    const rows = new Map<string, StoredLeaderboardRow>(
      seed.map((r) => [key(r), r] as const),
    );
    return {
      upsert: (row) =>
        Effect.sync(() => {
          rows.set(key(row), row);
        }),
      rows: (segment, scopeKey, season) =>
        Effect.sync(() =>
          [...rows.values()].filter(
            (r) =>
              r.segment === segment && r.scopeKey === scopeKey && r.season === season,
          ),
        ),
    };
  });

export const LeaderboardRepoMemory: Layer.Layer<LeaderboardRepo> =
  LeaderboardRepoMemorySeeded();

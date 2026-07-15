import { Effect } from "effect";
import {
  LedgerService,
  type LoggedEntry,
} from "../features/ledger/application/ledger-service.js";
import type { WorkoutEntry } from "../features/ledger/domain/parser.js";
import { Clock } from "../shared/time/clock.js";
import { istDayNumber } from "../features/streaks-ranks/domain/ist.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

/** Flatten the WorkoutEntry union into the SDL's single WorkoutChip shape. */
const toChip = (e: WorkoutEntry) => ({
  kind: e.kind,
  exercise: "exercise" in e ? e.exercise : null,
  sets: e.kind === "STRENGTH" ? e.sets : null,
  reps: e.kind === "STRENGTH" ? e.reps : null,
  weightKg: e.kind === "STRENGTH" ? e.weightKg : null,
  distanceKm: e.kind === "CARDIO" ? e.distanceKm : null,
  durationMin: e.kind === "CARDIO" ? e.durationMin : null,
  uncertain: e.uncertain,
  note: "note" in e ? (e.note ?? null) : null,
  raw: e.raw,
});

const toLedgerEntry = (l: LoggedEntry) => ({
  id: l.id,
  chip: toChip(l.entry),
  isPR: l.isPR,
  loggedByCoach: l.coachId != null,
  loggedAt: l.loggedAt,
});

export const ledgerResolvers = {
  Query: {
    ledgerToday: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const svc = yield* LedgerService;
          const clock = yield* Clock;
          const now = yield* clock.now;
          const today = istDayNumber(now);
          const rows = yield* svc.history(viewer.id);
          return rows
            .filter((r) => istDayNumber(new Date(r.loggedAt)) === today)
            .map(toLedgerEntry);
        }),
      );
    },

    ledgerHistory: (
      _p: unknown,
      args: { exercise?: string | null },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        LedgerService.pipe(
          Effect.flatMap((s) =>
            s.history(viewer.id, args.exercise ?? undefined),
          ),
          Effect.map((rows) => rows.map(toLedgerEntry)),
        ),
      );
    },
  },

  Mutation: {
    logWorkout: (_p: unknown, args: { text: string }, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        LedgerService.pipe(
          Effect.flatMap((s) => s.log(viewer.id, args.text)),
          Effect.map((rows) => rows.map(toLedgerEntry)),
        ),
      );
    },
  },
};

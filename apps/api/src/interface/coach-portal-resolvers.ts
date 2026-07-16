import { Effect } from "effect";
import type { Booking, CoachId, UserId } from "@gymkartel/contracts";
import { CoachPortalService } from "../features/coach-portal/application/coach-portal-service.js";
import { BookingRepo } from "../features/bookings/application/booking-repo.js";
import { UserRepo } from "../features/onboarding/application/user-repo.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireCoach, coachForViewer } from "./guards.js";

interface CoachClientRow {
  readonly id: UserId;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly sessions: number;
}

const isConfirmed = (b: Booking): boolean =>
  b.status === "CONFIRMED" || b.status === "COMPLETED";

const buildClients = (coachId: CoachId) =>
  Effect.gen(function* () {
    const bookingRepo = yield* BookingRepo;
    const userRepo = yield* UserRepo;
    const all = yield* bookingRepo.forCoach(coachId);
    const counts = new Map<UserId, number>();
    for (const b of all) {
      if (!isConfirmed(b)) continue;
      counts.set(b.memberId, (counts.get(b.memberId) ?? 0) + 1);
    }
    const rows: CoachClientRow[] = [];
    for (const [memberId, sessions] of counts) {
      const user = yield* userRepo.findById(memberId);
      rows.push({
        id: memberId,
        name: user?.name ?? "Member",
        avatarUrl: user?.avatarUrl ?? null,
        sessions,
      });
    }
    return rows.sort((a, b) => b.sessions - a.sessions);
  });

export const coachPortalResolvers = {
  Query: {
    coachDashboard: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireCoach(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const coach = yield* coachForViewer(viewer.id);
          const portal = yield* CoachPortalService;
          return yield* portal.dashboard(coach.id);
        }),
      );
    },

    coachCalendar: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireCoach(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const coach = yield* coachForViewer(viewer.id);
          const portal = yield* CoachPortalService;
          return yield* portal.calendar(coach.id);
        }),
      );
    },

    coachClients: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireCoach(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const coach = yield* coachForViewer(viewer.id);
          return yield* buildClients(coach.id);
        }),
      );
    },

    coachClient: (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const viewer = requireCoach(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const coach = yield* coachForViewer(viewer.id);
          const clients = yield* buildClients(coach.id);
          return clients.find((c) => c.id === args.id) ?? null;
        }),
      );
    },

    coachEarnings: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireCoach(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const coach = yield* coachForViewer(viewer.id);
          const portal = yield* CoachPortalService;
          return yield* portal.earnings(coach.id);
        }),
      );
    },

    coachProfile: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireCoach(ctx);
      return runResolver(ctx.runtime, coachForViewer(viewer.id));
    },
  },
};

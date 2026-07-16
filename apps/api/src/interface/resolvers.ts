import { Effect } from "effect";
import type {
  Booking,
  CheckIn,
  Coach,
  CoachId,
  Gym,
  GymId,
  Pass,
  Tier,
  User,
} from "@gymkartel/contracts";
import { AuthService } from "../features/auth/application/auth-service.js";
import { CheckInService } from "../features/check-in/application/checkin-service.js";
import { PassesService } from "../features/passes/application/passes-service.js";
import { GymRepo } from "../features/gyms/application/gym-repo.js";
import { CoachRepo } from "../features/coaches/application/coach-repo.js";
import { CoachesService } from "../features/coaches/application/coaches-service.js";
import { BookingsService } from "../features/bookings/application/bookings-service.js";
import { StreaksService } from "../features/streaks-ranks/application/streaks-service.js";
import { VersionGateService } from "../features/version-gate/application/version-gate-service.js";
import { UserRepo } from "../features/onboarding/application/user-repo.js";
import { daysLeft } from "../features/passes/domain/pass-rules.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";
import { chatResolvers } from "./chat-resolvers.js";
import { leaderboardResolvers } from "./leaderboard-resolvers.js";
import { ledgerResolvers } from "./ledger-resolvers.js";
import { streakResolvers } from "./streak-resolvers.js";
import { safetyResolvers } from "./safety-resolvers.js";
import { coachPortalResolvers } from "./coach-portal-resolvers.js";
import { notificationResolvers } from "./notification-resolvers.js";
import { featureFlagResolvers } from "./feature-flag-resolvers.js";

const viewerTier = (ctx: GraphQLContext): Effect.Effect<Tier, never, UserRepo> => {
  const v = ctx.viewer;
  if (!v) return Effect.succeed("BASIC");
  return UserRepo.pipe(
    Effect.flatMap((repo) => repo.findById(v.id)),
    Effect.map((user) => user?.tier ?? "BASIC"),
    Effect.catchAll(() => Effect.succeed<Tier>("BASIC")),
  );
};

type AnnotatedCheckIn = CheckIn & { readonly __dayNumber?: number };

const annotateHistory = (rows: readonly CheckIn[]): AnnotatedCheckIn[] => {
  const asc = [...rows].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
  const numbers = new Map<string, number>();
  asc.forEach((c, i) => numbers.set(c.id, i + 1));
  return rows.map((c) => ({ ...c, __dayNumber: numbers.get(c.id) ?? 0 }));
};

const coreResolvers = {
  Query: {
    viewer: (_p: unknown, _a: unknown, ctx: GraphQLContext): Promise<User | null> => {
      const v = ctx.viewer;
      if (!v) return Promise.resolve(null);
      return runResolver(
        ctx.runtime,
        UserRepo.pipe(Effect.flatMap((repo) => repo.findById(v.id))),
      );
    },

    versionGate: (_p: unknown, _a: unknown, ctx: GraphQLContext) =>
      runResolver(ctx.runtime, VersionGateService.pipe(Effect.flatMap((s) => s.get))),

    gyms: (
      _p: unknown,
      args: { zone?: string | null; peekOtherTiers?: boolean | null },
      ctx: GraphQLContext,
    ) =>
      runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const repo = yield* GymRepo;
          const tier = yield* viewerTier(ctx);
          return yield* repo.list({
            ...(args.zone ? { zone: args.zone as Gym["zone"] } : {}),
            tier,
            includeOtherTiers: args.peekOtherTiers ?? false,
          });
        }),
      ),

    gym: (_p: unknown, args: { id: string }, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        GymRepo.pipe(Effect.flatMap((r) => r.getById(args.id as Gym["id"]))),
      ),

    passLadder: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const tier = yield* viewerTier(ctx);
          const passes = yield* PassesService;
          return passes.ladderFor(tier).map((row) => ({ ...row }));
        }),
      );
    },

    coaches: (
      _p: unknown,
      args: {
        specialty?: string | null;
        femaleOnly?: boolean | null;
        maxPricePaise?: number | null;
      },
      ctx: GraphQLContext,
    ) =>
      runResolver(
        ctx.runtime,
        CoachesService.pipe(
          Effect.flatMap((s) =>
            s.browse({
              ...(args.specialty ? { specialty: args.specialty } : {}),
              ...(args.femaleOnly != null ? { femaleOnly: args.femaleOnly } : {}),
              ...(args.maxPricePaise != null
                ? { maxPricePaise: args.maxPricePaise }
                : {}),
            }),
          ),
        ),
      ),

    coach: (_p: unknown, args: { id: string }, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        CoachRepo.pipe(Effect.flatMap((r) => r.getById(args.id as Coach["id"]))),
      ),

    bookings: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        BookingsService.pipe(Effect.flatMap((s) => s.forMember(viewer.id))),
      );
    },

    checkInHistory: (
      _p: unknown,
      args: { limit?: number | null },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        CheckInService.pipe(
          Effect.flatMap((s) => s.history(viewer.id, args.limit ?? 30)),
          Effect.map(annotateHistory),
        ),
      );
    },
  },

  Mutation: {
    requestOtp: (
      _p: unknown,
      args: { input: { phone: string } },
      ctx: GraphQLContext,
    ) =>
      runResolver(
        ctx.runtime,
        AuthService.pipe(Effect.flatMap((s) => s.requestOtp(args.input.phone))),
      ),

    verifyOtp: (
      _p: unknown,
      args: { input: { phone: string; code: string } },
      ctx: GraphQLContext,
    ) =>
      runResolver(
        ctx.runtime,
        AuthService.pipe(
          Effect.flatMap((s) => s.verifyOtp(args.input.phone, args.input.code)),
        ),
      ),

    refreshSession: (
      _p: unknown,
      args: { refreshToken: string },
      ctx: GraphQLContext,
    ) =>
      runResolver(
        ctx.runtime,
        AuthService.pipe(Effect.flatMap((s) => s.refreshSession(args.refreshToken))),
      ),

    createPassOrder: (
      _p: unknown,
      args: { input: { pack: Pass["pack"] } },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const tier = yield* viewerTier(ctx);
          const passes = yield* PassesService;
          const order = yield* passes.createOrder({
            userId: viewer.id,
            tier,
            pack: args.input.pack,
          });
          return {
            orderId: order.orderId,
            amountPaise: order.amountPaise,
            currency: order.currency,
          };
        }),
      );
    },

    createTopUpOrder: (
      _p: unknown,
      args: {
        input: {
          gymId?: string | null;
          gymCheckInCode?: string | null;
          idempotencyKey: string;
        };
      },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        CheckInService.pipe(
          Effect.flatMap((s) =>
            s.createTopUpOrder(viewer.id, {
              ...(args.input.gymId ? { gymId: args.input.gymId } : {}),
              ...(args.input.gymCheckInCode
                ? { gymCheckInCode: args.input.gymCheckInCode }
                : {}),
              idempotencyKey: args.input.idempotencyKey,
            }),
          ),
          Effect.map((order) => ({
            orderId: order.orderId,
            amountPaise: order.amountPaise,
            currency: order.currency,
          })),
        ),
      );
    },

    createBookingOrder: (
      _p: unknown,
      args: {
        input: { coachId: string; gymId: string; scheduledFor: string };
      },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        BookingsService.pipe(
          Effect.flatMap((s) =>
            s.createBookingOrder({
              memberId: viewer.id,
              coachId: args.input.coachId as CoachId,
              gymId: args.input.gymId as GymId,
              scheduledFor: args.input.scheduledFor,
            }),
          ),
          Effect.map((order) => ({
            orderId: order.orderId,
            amountPaise: order.amountPaise,
            currency: order.currency,
          })),
        ),
      );
    },

    syncCheckIn: (_p: unknown, args: { input: unknown }, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        CheckInService.pipe(
          Effect.flatMap((s) => s.syncCheckIn(viewer.id, args.input)),
          Effect.map(
            (checkIn) =>
              ({ checkIn, topUpRequired: null }) as {
                checkIn: AnnotatedCheckIn | null;
                topUpRequired: {
                  gymTier: Tier;
                  amountPaise: number;
                  razorpayOrderId: string;
                } | null;
              },
          ),
          Effect.catchTag("TopUpRequired", (e) =>
            Effect.succeed({
              checkIn: null,
              topUpRequired: {
                gymTier: e.gymTier,
                amountPaise: e.amountPaise as number,
                razorpayOrderId: e.razorpayOrderId,
              },
            }),
          ),
        ),
      );
    },
  },

  Viewer: {
    id: (u: User) => u.id,
    zone: (u: User) => u.zone as string,
    activePass: (u: User, _a: unknown, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        PassesService.pipe(Effect.flatMap((s) => s.activeForUser(u.id))),
      ),
    streak: (u: User, _a: unknown, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        StreaksService.pipe(
          Effect.flatMap((s) => s.forUser(u.id)),
          Effect.map((vs) => ({
            current: vs.state.weeks,
            windowDaysLeft: vs.state.windowDaysLeft,
            bonusDaysEarned: vs.state.bonusDaysEarned,
          })),
        ),
      ),
  },

  Pass: {
    daysLeft: (p: Pass) => daysLeft(p),
  },

  Gym: {
    distanceMeters: () => null,
    location: (g: Gym) => {
      const [lng, lat] = g.location.coordinates;
      return { lat, lng };
    },
  },

  Coach: {
    pricePerSessionPaise: (c: Coach) => c.pricePerSession as number,
    badge: (c: Coach) => c.badge ?? null,
  },

  Booking: {
    pricePaise: (b: Booking) => b.price as number,
    chatUnlocked: (b: Booking) => b.chatUnlockedAt != null,
    coach: (b: Booking, _a: unknown, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        CoachRepo.pipe(Effect.flatMap((r) => r.getById(b.coachId))),
      ),
    gym: (b: Booking, _a: unknown, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        GymRepo.pipe(Effect.flatMap((r) => r.getById(b.gymId))),
      ),
  },

  CheckIn: {
    topUpAmountPaise: (c: AnnotatedCheckIn) => c.topUp?.amount ?? null,
    dayNumber: (c: AnnotatedCheckIn) => c.__dayNumber ?? 0,
    gym: (c: AnnotatedCheckIn, _a: unknown, ctx: GraphQLContext) =>
      runResolver(
        ctx.runtime,
        GymRepo.pipe(Effect.flatMap((r) => r.getById(c.gymId))),
      ),
  },
};

type ResolverMap = Record<string, Record<string, unknown>>;

const mergeResolvers = (...maps: readonly ResolverMap[]): ResolverMap => {
  const out: ResolverMap = {};
  for (const map of maps) {
    for (const [typeName, fields] of Object.entries(map)) {
      out[typeName] = { ...(out[typeName] ?? {}), ...fields };
    }
  }
  return out;
};

export const resolvers = mergeResolvers(
  coreResolvers as ResolverMap,
  chatResolvers as ResolverMap,
  leaderboardResolvers as ResolverMap,
  ledgerResolvers as ResolverMap,
  streakResolvers as ResolverMap,
  safetyResolvers as ResolverMap,
  coachPortalResolvers as ResolverMap,
  notificationResolvers as ResolverMap,
  featureFlagResolvers as ResolverMap,
);

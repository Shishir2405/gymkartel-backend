import { Layer, ManagedRuntime } from "effect";
import { ConfigLive } from "../shared/config/config.js";
import { ClockLive } from "../shared/time/clock.js";
import { LoggerLive } from "../shared/logger/logger.js";
import { TokenServiceLive } from "../shared/auth/tokens.js";

import {
  OtpStoreMemory,
  RateLimiterAllow,
  SessionStoreMemory,
} from "../features/auth/infrastructure/in-memory.js";
import { AuthServiceLive } from "../features/auth/application/auth-service.js";
import { NotificationServiceMemory } from "../features/notifications/infrastructure/in-memory.js";
import { UserRepoMemory } from "../features/onboarding/infrastructure/in-memory.js";
import {
  OrderRepoMemory,
  PaymentGatewayMemory,
} from "../features/payments/infrastructure/in-memory.js";
import { PaymentsServiceLive } from "../features/payments/application/payments-service.js";
import { PassRepoMemory } from "../features/passes/infrastructure/in-memory.js";
import { PassesServiceLive } from "../features/passes/application/passes-service.js";
import { GymRepoMemory } from "../features/gyms/infrastructure/in-memory.js";
import {
  CheckInEventsMemory,
  CheckInRepoMemory,
} from "../features/check-in/infrastructure/in-memory.js";
import { CheckInServiceLive } from "../features/check-in/application/checkin-service.js";
import { CoachRepoMemory } from "../features/coaches/infrastructure/in-memory.js";
import { CoachesServiceLive } from "../features/coaches/application/coaches-service.js";
import { BookingRepoMemory } from "../features/bookings/infrastructure/in-memory.js";
import { BookingsServiceLive } from "../features/bookings/application/bookings-service.js";
import { StreaksServiceLive } from "../features/streaks-ranks/application/streaks-service.js";
import { VersionGateServiceLive } from "../features/version-gate/application/version-gate-service.js";
import {
  ChatServiceLive,
  ChatRepoMemory,
} from "../features/chat/application/chat-service.js";
import {
  LedgerServiceLive,
  LedgerRepoMemory,
} from "../features/ledger/application/ledger-service.js";
import {
  LeaderboardServiceLive,
  LeaderboardRepoMemorySeeded,
} from "../features/leaderboards/application/leaderboard-service.js";
import {
  SafetyServiceLive,
  IncidentRepoMemory,
  IncidentEscalatorMemory,
} from "../features/safety/application/safety-service.js";
import { CoachPortalServiceLive } from "../features/coach-portal/application/coach-portal-service.js";
import { NotificationInboxMemory } from "../features/notifications/application/inbox.js";
import { FeatureFlagsMemory } from "../features/feature-flags/feature-flags.js";

import { MongoLive } from "../shared/db/mongo.js";
import { RedisLive } from "../shared/redis/redis.js";
import { RabbitLive } from "../shared/mq/rabbit.js";
import {
  OtpStoreRedis,
  SessionStoreRedis,
  RateLimiterRedisLive,
} from "../features/auth/infrastructure/redis.js";
import { UserRepoMongo } from "../features/onboarding/infrastructure/mongo.js";
import { PaymentGatewayLive } from "../features/payments/infrastructure/razorpay.js";
import { OrderRepoMongo } from "../features/payments/infrastructure/mongo.js";
import { PassRepoMongo } from "../features/passes/infrastructure/mongo.js";
import { GymRepoMongo } from "../features/gyms/infrastructure/mongo.js";
import { CheckInRepoMongo } from "../features/check-in/infrastructure/mongo.js";
import { CheckInEventsRabbit } from "../features/check-in/infrastructure/rabbit.js";
import { CoachRepoMongo } from "../features/coaches/infrastructure/mongo.js";
import { BookingRepoMongo } from "../features/bookings/infrastructure/mongo.js";
import { ChatRepoMongo } from "../features/chat/infrastructure/mongo.js";
import { LedgerRepoMongo } from "../features/ledger/infrastructure/mongo.js";
import { LeaderboardRepoMongo } from "../features/leaderboards/infrastructure/mongo.js";
import { IncidentRepoMongo } from "../features/safety/infrastructure/mongo.js";
import { IncidentEscalatorRabbit } from "../features/safety/infrastructure/rabbit.js";
import { NotificationInboxMongo } from "../features/notifications/infrastructure/inbox-mongo.js";
import { FeatureFlagsMongo } from "../features/feature-flags/mongo.js";

import {
  seedCoaches,
  seedGyms,
  seedPasses,
  seedUsers,
  seedBookings,
  seedLeaderboardRows,
  seedNotifications,
  seedFeatureFlags,
} from "./fixtures.js";

const memoryInfra = Layer.mergeAll(
  ConfigLive,
  ClockLive,
  LoggerLive,
  OtpStoreMemory,
  RateLimiterAllow,
  SessionStoreMemory,
  NotificationServiceMemory(),
  UserRepoMemory(seedUsers),
  PaymentGatewayMemory,
  OrderRepoMemory(),
  PassRepoMemory(seedPasses),
  GymRepoMemory(seedGyms),
  CheckInRepoMemory(),
  CheckInEventsMemory(),
  CoachRepoMemory(seedCoaches),
  BookingRepoMemory(seedBookings),
  ChatRepoMemory,
  LedgerRepoMemory,
  LeaderboardRepoMemorySeeded(seedLeaderboardRows),
  IncidentRepoMemory,
  IncidentEscalatorMemory,
  NotificationInboxMemory(seedNotifications),
  FeatureFlagsMemory(seedFeatureFlags),
).pipe(Layer.provideMerge(ConfigLive));

const mongoDrivers = Layer.mergeAll(MongoLive, RedisLive, RabbitLive).pipe(
  Layer.provide(ConfigLive),
  Layer.orDie,
);

const mongoInfra = Layer.mergeAll(
  ClockLive,
  LoggerLive,
  NotificationServiceMemory(),
  OtpStoreRedis,
  SessionStoreRedis,
  RateLimiterRedisLive,
  UserRepoMongo,
  PaymentGatewayLive,
  OrderRepoMongo,
  PassRepoMongo,
  GymRepoMongo,
  CheckInRepoMongo,
  CheckInEventsRabbit,
  CoachRepoMongo,
  BookingRepoMongo,
  ChatRepoMongo,
  LedgerRepoMongo,
  LeaderboardRepoMongo,
  IncidentRepoMongo,
  IncidentEscalatorRabbit,
  NotificationInboxMongo,
  FeatureFlagsMongo,
).pipe(Layer.provide(mongoDrivers), Layer.provideMerge(ConfigLive));

const infra = process.env.PERSISTENCE === "mongo" ? mongoInfra : memoryInfra;

const tokens = TokenServiceLive.pipe(Layer.provide(infra));
const payments = PaymentsServiceLive.pipe(Layer.provide(infra));
const coaches = CoachesServiceLive.pipe(Layer.provide(infra));
const versionGate = VersionGateServiceLive.pipe(Layer.provide(infra));
const chat = ChatServiceLive.pipe(Layer.provide(infra));
const ledger = LedgerServiceLive.pipe(Layer.provide(infra));
const leaderboard = LeaderboardServiceLive.pipe(Layer.provide(infra));
const safety = SafetyServiceLive.pipe(Layer.provide(infra));
const coachPortal = CoachPortalServiceLive.pipe(Layer.provide(infra));

const tier1 = Layer.mergeAll(
  infra,
  tokens,
  payments,
  coaches,
  versionGate,
  chat,
  ledger,
  leaderboard,
  safety,
  coachPortal,
);

const passes = PassesServiceLive.pipe(Layer.provide(tier1));
const checkin = CheckInServiceLive.pipe(Layer.provide(tier1));
const bookings = BookingsServiceLive.pipe(Layer.provide(tier1));
const streaks = StreaksServiceLive.pipe(Layer.provide(tier1));
const auth = AuthServiceLive.pipe(Layer.provide(tier1));

export const AppLayer = Layer.mergeAll(
  tier1,
  passes,
  checkin,
  bookings,
  streaks,
  auth,
);

export const appRuntime = ManagedRuntime.make(AppLayer);
export type AppRuntime = typeof appRuntime;

export type AppServices = ManagedRuntime.ManagedRuntime.Context<AppRuntime>;

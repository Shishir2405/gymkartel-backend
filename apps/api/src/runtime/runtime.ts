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

import { seedCoaches, seedGyms, seedPasses, seedUsers } from "./fixtures.js";

/**
 * Composition root. Wires every feature's application service against the
 * in-memory infrastructure adapters so the API boots WITHOUT Mongo/Redis/Rabbit
 * (the brief forbids connecting to real infra here). The production root would
 * substitute the driver-backed layers (MongoLive, RedisLive, RabbitLive,
 * PaymentGatewayLive, Brevo/Expo notifiers) — the application layer is identical
 * because everything is injected through the same Effect ports.
 */
const infra = Layer.mergeAll(
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
  BookingRepoMemory(),
).pipe(Layer.provideMerge(ConfigLive));

// Tier 1: services that depend only on infra.
const tokens = TokenServiceLive.pipe(Layer.provide(infra));
const payments = PaymentsServiceLive.pipe(Layer.provide(infra));
const coaches = CoachesServiceLive.pipe(Layer.provide(infra));
const versionGate = VersionGateServiceLive.pipe(Layer.provide(infra));

const tier1 = Layer.mergeAll(infra, tokens, payments, coaches, versionGate);

// Tier 2: services that also depend on tier-1 services (payments/tokens).
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

/** The full service environment provided by the runtime. */
export type AppServices = ManagedRuntime.ManagedRuntime.Context<AppRuntime>;

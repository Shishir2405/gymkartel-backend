import type {
  Booking,
  BookingId,
  Coach,
  CoachId,
  Gym,
  GymId,
  IndianState,
  Pass,
  PassId,
  Paise,
  PhoneNumber,
  User,
  UserId,
  Zone,
} from "@gymkartel/contracts";
import type { StoredLeaderboardRow } from "../features/leaderboards/application/leaderboard-service.js";
import type { SeedNotification } from "../features/notifications/application/inbox.js";
import { istSeasonKey } from "../features/streaks-ranks/domain/ist.js";

/**
 * Seed data for the infra-free local runtime (no Mongo/Redis/Rabbit). Lets the
 * GraphQL server boot and every query return something without a database. The
 * production composition root swaps the in-memory layers for the driver-backed
 * adapters and drops these fixtures.
 */
const iso = "2026-01-01T00:00:00.000Z";
const zone = "koramangala" as Zone;
const state = "KA" as IndianState;

export const DEMO_PHONE = "+919876543210" as PhoneNumber;

export const seedUsers: User[] = [
  {
    schemaVersion: 1,
    id: "user_demo" as UserId,
    phone: DEMO_PHONE,
    role: "MEMBER",
    name: "Demo Member",
    tier: "STANDARD",
    zone,
    state,
    phoneVerifiedAt: iso,
    createdAt: iso,
    updatedAt: iso,
  },
];

export const seedGyms: Gym[] = [
  {
    schemaVersion: 1,
    id: "gym_iron" as GymId,
    name: "Iron Paradise Koramangala",
    tier: "STANDARD",
    zone,
    state,
    location: { type: "Point", coordinates: [77.6229, 12.9352] },
    address: "80 Feet Rd, Koramangala",
    amenities: ["FREE_WEIGHTS", "CARDIO", "SHOWERS"],
    photoUrls: [],
    checkInCode: "GYM-IRON-001",
    rating: 4.6,
    liveBusyFraction: 0.4,
    createdAt: iso,
    updatedAt: iso,
  },
  {
    schemaVersion: 1,
    id: "gym_elite" as GymId,
    name: "Elite Strength Club",
    tier: "PREMIUM",
    zone,
    state,
    location: { type: "Point", coordinates: [77.6, 12.93] },
    address: "Indiranagar 100ft Rd",
    amenities: ["POOL", "SAUNA", "PT_AVAILABLE", "CROSSFIT"],
    photoUrls: [],
    checkInCode: "GYM-ELITE-002",
    rating: 4.9,
    liveBusyFraction: 0.7,
    createdAt: iso,
    updatedAt: iso,
  },
];

export const seedPasses: Pass[] = [
  {
    schemaVersion: 1,
    id: "pass_demo" as PassId,
    userId: "user_demo" as UserId,
    tier: "STANDARD",
    pack: "FIFTEEN_DAY",
    daysTotal: 15,
    daysUsed: 3,
    bonusDays: 1,
    purchasedAt: iso,
    validUntil: "2099-01-01T00:00:00.000Z",
    status: "ACTIVE",
    orderId: "order_seed_demo",
    createdAt: iso,
    updatedAt: iso,
  },
];

/**
 * Leaderboard rows for the CURRENT IST season so `leaderboard(ZONE)` returns a
 * populated page (with the demo member on it) out of the box. Ranking is
 * attendance-only; these are hand-picked to show a plausible ordering.
 */
const season = istSeasonKey(new Date());

export const seedLeaderboardRows: StoredLeaderboardRow[] = [
  {
    segment: "ZONE",
    scopeKey: zone,
    season,
    userId: "user_rival" as UserId,
    displayName: "Kabir R.",
    streak: 6,
    totalCheckIns: 40,
  },
  {
    segment: "ZONE",
    scopeKey: zone,
    season,
    userId: "user_demo" as UserId,
    displayName: "Demo Member",
    streak: 3,
    totalCheckIns: 12,
  },
  {
    segment: "STATE",
    scopeKey: state,
    season,
    userId: "user_demo" as UserId,
    displayName: "Demo Member",
    streak: 3,
    totalCheckIns: 12,
  },
  {
    segment: "INDIA",
    scopeKey: "INDIA",
    season,
    userId: "user_demo" as UserId,
    displayName: "Demo Member",
    streak: 3,
    totalCheckIns: 12,
  },
];

export const seedNotifications: SeedNotification[] = [
  {
    userId: "user_demo" as UserId,
    kind: "STREAK",
    title: "Streak alive!",
    body: "You've trained 3 days this week — keep it going.",
    createdAt: iso,
  },
  {
    userId: "user_demo" as UserId,
    kind: "PASS",
    title: "Pass activated",
    body: "Your 15-day pass is live.",
    createdAt: iso,
  },
];

/** Seeded feature flags for the infra-free runtime. */
export const seedFeatureFlags: Readonly<Record<string, boolean>> = {
  leaderboards: true,
  coach_chat: true,
  ledger_v2: false,
};

export const seedCoaches: Coach[] = [
  {
    schemaVersion: 1,
    id: "coach_neha" as CoachId,
    userId: "user_neha" as UserId,
    displayName: "Neha S.",
    verified: true,
    badge: "ELITE",
    bio: "Strength & women's fitness specialist. 8 years coaching.",
    specialties: ["strength", "women", "fat-loss"],
    pricePerSession: 80000 as Paise,
    tierFloor: "STANDARD",
    certifications: [
      {
        title: "ACE CPT",
        issuer: "American Council on Exercise",
        documentUrl: "https://assets.gymkartel.example/cert/neha.pdf",
        status: "VERIFIED",
      },
    ],
    ratingAverage: 4.8,
    sessionsCompleted: 320,
    transformationPhotoUrls: [],
    createdAt: iso,
    updatedAt: iso,
  },
  {
    schemaVersion: 1,
    id: "coach_arjun" as CoachId,
    userId: "user_arjun" as UserId,
    displayName: "Arjun M.",
    verified: false,
    bio: "Powerlifting coach. Meet-prep focused.",
    specialties: ["powerlifting", "strength"],
    pricePerSession: 120000 as Paise,
    tierFloor: "PREMIUM",
    certifications: [],
    ratingAverage: 4.5,
    sessionsCompleted: 95,
    transformationPhotoUrls: [],
    createdAt: iso,
    updatedAt: iso,
  },
];

/**
 * One confirmed booking for the demo member with chat already unlocked, so the
 * infra-free runtime can exercise the post-booking chat + inbox surfaces.
 */
export const seedBookings: Booking[] = [
  {
    schemaVersion: 1,
    id: "bk_demo" as BookingId,
    memberId: "user_demo" as UserId,
    coachId: "coach_neha" as CoachId,
    gymId: "gym_iron" as GymId,
    scheduledFor: "2026-07-15T10:00:00.000Z",
    price: 80000 as Paise,
    status: "CONFIRMED",
    orderId: "order_seed_bk_demo",
    insured: true,
    chatUnlockedAt: iso,
    createdAt: iso,
    updatedAt: iso,
  },
];

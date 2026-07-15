import type { IndexDescription } from "mongodb";

/**
 * MongoDB index definitions declared in code (one block per collection) and
 * applied by the startup script `apply-indexes.ts`. Includes the two indexes
 * the brief calls out explicitly:
 *   - checkIns:            { userId:1, gymId:1, scannedAt:-1 }
 *   - leaderboardEntries:  { zone:1, season:1, streak:-1 }
 */
export const COLLECTION_INDEXES: Record<string, IndexDescription[]> = {
  users: [
    { key: { phone: 1 }, unique: true, name: "uniq_phone" },
    { key: { zone: 1, tier: 1 }, name: "zone_tier" },
  ],
  passes: [
    { key: { userId: 1, status: 1 }, name: "user_status" },
    { key: { orderId: 1 }, unique: true, name: "uniq_order" },
  ],
  gyms: [
    { key: { checkInCode: 1 }, unique: true, name: "uniq_checkin_code" },
    { key: { zone: 1, tier: 1 }, name: "zone_tier" },
    { key: { location: "2dsphere" }, name: "geo" },
  ],
  checkIns: [
    // Called out in the brief — powers per-user/per-gym history + dedup reads.
    { key: { userId: 1, gymId: 1, scannedAt: -1 }, name: "user_gym_scannedAt" },
    { key: { idempotencyKey: 1 }, unique: true, name: "uniq_idempotency" },
  ],
  coaches: [
    { key: { verified: 1, ratingAverage: -1 }, name: "verified_rating" },
    { key: { specialties: 1 }, name: "specialties" },
  ],
  bookings: [
    { key: { memberId: 1, scheduledFor: -1 }, name: "member_schedule" },
    { key: { coachId: 1, scheduledFor: 1 }, name: "coach_slot" },
    { key: { orderId: 1 }, unique: true, name: "uniq_order" },
  ],
  orders: [{ key: { orderId: 1 }, unique: true, name: "uniq_order" }],
  leaderboardEntries: [
    // Called out in the brief — the hot leaderboard read path.
    { key: { zone: 1, season: 1, streak: -1 }, name: "zone_season_streak" },
    // The row model stores segment + scopeKey (zone/state/"INDIA"), so the
    // actual read + upsert keys index those. One row per member per segment per
    // monthly season.
    { key: { segment: 1, scopeKey: 1, season: 1, streak: -1 }, name: "segment_scope_season_streak" },
    {
      key: { segment: 1, scopeKey: 1, season: 1, userId: 1 },
      unique: true,
      name: "uniq_segment_scope_season_user",
    },
  ],
  featureFlags: [{ key: { key: 1 }, unique: true, name: "uniq_flag" }],
  chatMessages: [
    // History reads: all messages for a booking in send order.
    { key: { bookingId: 1, sentAt: 1 }, name: "booking_sentAt" },
  ],
  ledgerEntries: [
    { key: { userId: 1, loggedAt: -1 }, name: "user_loggedAt" },
    // PR lookups: best strength weight for a user + exercise.
    { key: { userId: 1, "entry.kind": 1, "entry.exercise": 1 }, name: "user_exercise" },
  ],
  incidents: [{ key: { userId: 1, createdAt: -1 }, name: "user_createdAt" }],
  notifications: [{ key: { userId: 1, createdAt: -1 }, name: "user_createdAt" }],
  pushTokens: [{ key: { userId: 1, token: 1 }, unique: true, name: "uniq_user_token" }],
};

import { z } from "zod";

/**
 * Shared primitives used across every aggregate schema.
 *
 * IDs are branded strings so a `UserId` can't be silently passed where a
 * `GymId` is expected — the brand is erased at runtime (it's still a string on
 * the wire and in Mongo) but the compiler enforces it everywhere.
 */

export const brandedId = <B extends string>(brand: B) =>
  z.string().min(1).brand(brand);

export const UserId = brandedId("UserId");
export type UserId = z.infer<typeof UserId>;

export const PassId = brandedId("PassId");
export type PassId = z.infer<typeof PassId>;

export const GymId = brandedId("GymId");
export type GymId = z.infer<typeof GymId>;

export const CheckInId = brandedId("CheckInId");
export type CheckInId = z.infer<typeof CheckInId>;

export const CoachId = brandedId("CoachId");
export type CoachId = z.infer<typeof CoachId>;

export const BookingId = brandedId("BookingId");
export type BookingId = z.infer<typeof BookingId>;

/**
 * The three membership tiers. Ordered ascending — the numeric rank is used by
 * the top-up logic to decide whether a scan needs a top-up (higher tier scans
 * a lower-tier gym for free; lower tier scanning higher pays the delta).
 */
export const Tier = z.enum(["BASIC", "STANDARD", "PREMIUM"]);
export type Tier = z.infer<typeof Tier>;

export const TIER_RANK: Record<Tier, number> = {
  BASIC: 0,
  STANDARD: 1,
  PREMIUM: 2,
};

/** ISO-8601 datetime string. Every persisted document carries created/updated. */
export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Timestamps = z.object({
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/**
 * Every document is versioned explicitly — Mongo has no migrations, so read
 * paths branch on this during a rollout. Bump when a stored shape changes in a
 * non-additive way and write a migration-runner entry for it.
 */
export const schemaVersion = (v: number) => z.literal(v).default(v);

/** Leaderboard geography. Zone is the finest grain, then state, then all-India. */
export const Zone = z.string().min(1).brand("Zone");
export type Zone = z.infer<typeof Zone>;

export const IndianState = z.string().min(1).brand("IndianState");
export type IndianState = z.infer<typeof IndianState>;

/** Money is always paise (integer) internally — never floating-point rupees. */
export const Paise = z.number().int().nonnegative().brand("Paise");
export type Paise = z.infer<typeof Paise>;

export const GeoPoint = z.object({
  type: z.literal("Point").default("Point"),
  /** GeoJSON order: [longitude, latitude]. */
  coordinates: z.tuple([z.number(), z.number()]),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

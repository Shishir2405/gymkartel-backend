import { z } from "zod";

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

export const Tier = z.enum(["BASIC", "STANDARD", "PREMIUM"]);
export type Tier = z.infer<typeof Tier>;

export const TIER_RANK: Record<Tier, number> = {
  BASIC: 0,
  STANDARD: 1,
  PREMIUM: 2,
};

export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Timestamps = z.object({
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const schemaVersion = (v: number) => z.literal(v).default(v);

export const Zone = z.string().min(1).brand("Zone");
export type Zone = z.infer<typeof Zone>;

export const IndianState = z.string().min(1).brand("IndianState");
export type IndianState = z.infer<typeof IndianState>;

export const Paise = z.number().int().nonnegative().brand("Paise");
export type Paise = z.infer<typeof Paise>;

export const GeoPoint = z.object({
  type: z.literal("Point").default("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

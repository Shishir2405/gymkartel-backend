import { z } from "zod";
import {
  GeoPoint,
  GymId,
  IndianState,
  Tier,
  Timestamps,
  Zone,
  schemaVersion,
} from "./common.js";

export const Amenity = z.enum([
  "PARKING",
  "SHOWERS",
  "LOCKERS",
  "CARDIO",
  "FREE_WEIGHTS",
  "CROSSFIT",
  "SAUNA",
  "POOL",
  "PT_AVAILABLE",
]);
export type Amenity = z.infer<typeof Amenity>;

export const Gym = z.object({
  schemaVersion: schemaVersion(1),
  id: GymId,
  name: z.string().min(1),
  tier: Tier,
  zone: Zone,
  state: IndianState,
  location: GeoPoint,
  address: z.string().min(1),
  amenities: z.array(Amenity).default([]),
  photoUrls: z.array(z.string().url()).default([]),
  googlePlaceId: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  checkInCode: z.string().min(1),
  liveBusyFraction: z.number().min(0).max(1).optional(),
}).merge(Timestamps);
export type Gym = z.infer<typeof Gym>;

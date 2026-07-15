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
  /** Photos come from the gym's Google Business Profile, cached to R2. */
  photoUrls: z.array(z.string().url()).default([]),
  googlePlaceId: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  /**
   * The QR payload a member scans at the door. Rotated periodically; the app
   * caches the last-known-good value so check-in works fully offline.
   */
  checkInCode: z.string().min(1),
  /** 0..1 occupancy for the live-busy meter; recomputed from recent check-ins. */
  liveBusyFraction: z.number().min(0).max(1).optional(),
}).merge(Timestamps);
export type Gym = z.infer<typeof Gym>;

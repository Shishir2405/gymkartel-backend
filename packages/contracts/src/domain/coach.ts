import { z } from "zod";
import {
  CoachId,
  Paise,
  Tier,
  Timestamps,
  UserId,
  schemaVersion,
} from "./common.js";

export const CoachBadge = z.enum(["ELITE", "LEGEND"]);
export type CoachBadge = z.infer<typeof CoachBadge>;

export const CertificationStatus = z.enum(["PENDING", "VERIFIED", "REJECTED"]);
export type CertificationStatus = z.infer<typeof CertificationStatus>;

export const Certification = z.object({
  title: z.string().min(1),
  issuer: z.string().min(1),
  documentUrl: z.string().url(),
  status: CertificationStatus.default("PENDING"),
});
export type Certification = z.infer<typeof Certification>;

export const Coach = z.object({
  schemaVersion: schemaVersion(1),
  id: CoachId,
  userId: UserId,
  displayName: z.string().min(1),
  verified: z.boolean().default(false),
  badge: CoachBadge.optional(),
  bio: z.string().max(1000),
  specialties: z.array(z.string().min(1)).default([]),
  pricePerSession: Paise,
  tierFloor: Tier,
  certifications: z.array(Certification).default([]),
  ratingAverage: z.number().min(0).max(5).optional(),
  sessionsCompleted: z.number().int().nonnegative().default(0),
  transformationPhotoUrls: z.array(z.string().url()).default([]),
}).merge(Timestamps);
export type Coach = z.infer<typeof Coach>;

export const COACH_TAKE_RATE = 0.8;

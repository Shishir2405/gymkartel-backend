import { z } from "zod";
import {
  IndianState,
  Tier,
  Timestamps,
  UserId,
  Zone,
  schemaVersion,
} from "./common.js";

/** E.164-ish phone. We only serve India today, so +91 followed by 10 digits. */
export const PhoneNumber = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "must be a +91 Indian mobile number")
  .brand("PhoneNumber");
export type PhoneNumber = z.infer<typeof PhoneNumber>;

export const UserRole = z.enum(["MEMBER", "COACH"]);
export type UserRole = z.infer<typeof UserRole>;

/**
 * The 4-card onboarding health quiz. Kept intentionally coarse — it steers gym
 * suggestions and coach matching, it is not medical data.
 */
export const HealthProfile = z.object({
  primaryGoal: z.enum(["STRENGTH", "FAT_LOSS", "ENDURANCE", "GENERAL"]),
  experience: z.enum(["NEW", "RETURNING", "REGULAR"]),
  trainingDaysTarget: z.number().int().min(1).max(7),
  injuriesNote: z.string().max(280).optional(),
});
export type HealthProfile = z.infer<typeof HealthProfile>;

export const User = z.object({
  schemaVersion: schemaVersion(1),
  id: UserId,
  phone: PhoneNumber,
  role: UserRole.default("MEMBER"),
  name: z.string().min(1).max(80),
  avatarUrl: z.string().url().optional(),
  tier: Tier,
  zone: Zone,
  state: IndianState,
  health: HealthProfile.optional(),
  /** Asked for once, right after the first coach booking — not at onboarding. */
  trustedContact: z
    .object({ name: z.string().min(1), phone: PhoneNumber })
    .optional(),
  phoneVerifiedAt: z.string().datetime({ offset: true }).optional(),
}).merge(Timestamps);
export type User = z.infer<typeof User>;

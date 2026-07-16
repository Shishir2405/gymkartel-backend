import { z } from "zod";
import {
  BookingId,
  CoachId,
  GymId,
  Paise,
  Timestamps,
  UserId,
  schemaVersion,
} from "./common.js";

export const BookingStatus = z.enum([
  "PENDING_PAYMENT",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED_BY_MEMBER",
  "CANCELLED_BY_COACH",
]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const Booking = z.object({
  schemaVersion: schemaVersion(1),
  id: BookingId,
  memberId: UserId,
  coachId: CoachId,
  gymId: GymId,
  scheduledFor: z.string().datetime({ offset: true }),
  price: Paise,
  status: BookingStatus,
  orderId: z.string().min(1),
  insured: z.boolean().default(true),
  chatUnlockedAt: z.string().datetime({ offset: true }).optional(),
}).merge(Timestamps);
export type Booking = z.infer<typeof Booking>;

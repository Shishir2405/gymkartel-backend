import { Context, Effect } from "effect";
import type { ExternalServiceError } from "../../../shared/errors/errors.js";

export const TEMPLATE = {
  otpSms: "sms-otp-v2",
  bookingConfirmedEmail: "email-booking-confirmed-v3",
  passActivatedEmail: "email-pass-activated-v1",
  streakAtRiskPush: "push-streak-risk-v1",
  incidentAckSms: "sms-incident-ack-v1",
} as const;

export type TemplateId = (typeof TEMPLATE)[keyof typeof TEMPLATE];

export type NotificationChannel = "SMS" | "EMAIL" | "WHATSAPP" | "PUSH";

export interface NotificationMessage {
  readonly channel: NotificationChannel;
  readonly template: TemplateId;
  readonly to: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface NotificationServiceApi {
  readonly send: (
    message: NotificationMessage,
  ) => Effect.Effect<void, ExternalServiceError>;
}

export class NotificationService extends Context.Tag(
  "features/notifications/NotificationService",
)<NotificationService, NotificationServiceApi>() {}

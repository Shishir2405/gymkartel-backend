import { Context, Effect } from "effect";
import type { ExternalServiceError } from "../../../shared/errors/errors.js";

/**
 * Versioned Brevo template IDs. Referenced by constant, never inline — a
 * template change is a code change gated by review.
 */
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
  /** Destination: phone (SMS/WhatsApp), email, or Expo push token. */
  readonly to: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * NotificationService port. Brevo adapter fulfils SMS/EMAIL/WHATSAPP; the Expo
 * adapter fulfils PUSH. The dispatch worker consumes queued messages with
 * DLX+retry, so callers only enqueue — they never block on the provider.
 */
export interface NotificationServiceApi {
  readonly send: (
    message: NotificationMessage,
  ) => Effect.Effect<void, ExternalServiceError>;
}

export class NotificationService extends Context.Tag(
  "features/notifications/NotificationService",
)<NotificationService, NotificationServiceApi>() {}

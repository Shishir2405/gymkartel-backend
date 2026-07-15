import { Data } from "effect";
// Use Yoga's error factory so thrown errors are the SAME GraphQLError instance
// Yoga checks against (avoids the "duplicate graphql module" masking pitfall).
import { createGraphQLError } from "graphql-yoga";
import type { GraphQLError } from "graphql";

/**
 * Cross-cutting infrastructure errors. Feature-specific domain errors live in
 * each feature's `domain/errors.ts`. Everything crossing a service boundary is
 * one of these tagged errors — never a raw thrown exception.
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly reason: string;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly op: string;
  readonly cause: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string;
  readonly message: string;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string;
  readonly id: string;
}> {}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly reason: string;
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly reason: string;
}> {}

export class RateLimitedError extends Data.TaggedError("RateLimitedError")<{
  readonly retryAfterMs: number;
}> {}

export class ExternalServiceError extends Data.TaggedError("ExternalServiceError")<{
  readonly service: string;
  readonly cause: unknown;
}> {}

export class MessageQueueError extends Data.TaggedError("MessageQueueError")<{
  readonly op: string;
  readonly cause: unknown;
}> {}

export class SerializationError extends Data.TaggedError("SerializationError")<{
  readonly message: string;
}> {}

/**
 * Map of tagged-error `_tag` → GraphQL extension code + HTTP-ish status.
 * The edge resolver adapter uses this so the app gets a stable machine code.
 */
export const ERROR_CODES: Record<string, { code: string; status: number }> = {
  // infra
  ConfigError: { code: "CONFIG_ERROR", status: 500 },
  DatabaseError: { code: "DATABASE_ERROR", status: 500 },
  ValidationError: { code: "BAD_USER_INPUT", status: 400 },
  NotFoundError: { code: "NOT_FOUND", status: 404 },
  UnauthorizedError: { code: "UNAUTHENTICATED", status: 401 },
  ForbiddenError: { code: "FORBIDDEN", status: 403 },
  RateLimitedError: { code: "RATE_LIMITED", status: 429 },
  ExternalServiceError: { code: "UPSTREAM_ERROR", status: 502 },
  MessageQueueError: { code: "QUEUE_ERROR", status: 500 },
  SerializationError: { code: "SERIALIZATION_ERROR", status: 500 },

  // auth
  InvalidOtpError: { code: "INVALID_OTP", status: 401 },
  OtpExpiredError: { code: "OTP_EXPIRED", status: 401 },
  InvalidTokenError: { code: "INVALID_TOKEN", status: 401 },

  // check-in
  NoActivePass: { code: "NO_ACTIVE_PASS", status: 409 },
  PassExpired: { code: "PASS_EXPIRED", status: 409 },
  TopUpRequired: { code: "TOP_UP_REQUIRED", status: 402 },
  DuplicateCheckIn: { code: "DUPLICATE_CHECKIN", status: 200 },
  GymNotFound: { code: "GYM_NOT_FOUND", status: 404 },
  TopUpPaymentPending: { code: "TOP_UP_PAYMENT_PENDING", status: 402 },

  // passes / payments
  PassNotFound: { code: "PASS_NOT_FOUND", status: 404 },
  PaymentVerificationError: { code: "PAYMENT_VERIFICATION_FAILED", status: 400 },
  OrderNotFound: { code: "ORDER_NOT_FOUND", status: 404 },
  DuplicateWebhook: { code: "DUPLICATE_WEBHOOK", status: 200 },

  // bookings / coaches
  SlotUnavailable: { code: "SLOT_UNAVAILABLE", status: 409 },
  BookingNotFound: { code: "BOOKING_NOT_FOUND", status: 404 },
  CoachNotFound: { code: "COACH_NOT_FOUND", status: 404 },
  AlreadyCancelled: { code: "ALREADY_CANCELLED", status: 409 },

  // chat / safety
  ChatLocked: { code: "CHAT_LOCKED", status: 403 },
  LocationShareLocked: { code: "LOCATION_SHARE_LOCKED", status: 403 },
  TrustedContactMissing: { code: "TRUSTED_CONTACT_MISSING", status: 409 },
};

export interface TaggedLike {
  readonly _tag: string;
}

export const isTagged = (u: unknown): u is TaggedLike =>
  typeof u === "object" && u !== null && "_tag" in u;

/** Translate any tagged domain/infra error into a GraphQL error at the edge. */
export const toGraphQLError = (error: unknown): GraphQLError => {
  if (isTagged(error)) {
    const mapping = ERROR_CODES[error._tag] ?? {
      code: "INTERNAL_ERROR",
      status: 500,
    };
    // Surface non-secret payload fields so the client can render (e.g. top-up).
    const extensions: Record<string, unknown> = {
      code: mapping.code,
      status: mapping.status,
    };
    for (const [k, v] of Object.entries(error as unknown as Record<string, unknown>)) {
      if (k === "_tag" || k === "stack" || k === "message") continue;
      if (k === "cause") continue; // never leak internal causes to clients
      extensions[k] = v;
    }
    return createGraphQLError(humanMessage(error._tag), { extensions });
  }
  return createGraphQLError("Internal server error", {
    extensions: { code: "INTERNAL_ERROR", status: 500 },
  });
};

const humanMessage = (tag: string): string => {
  switch (tag) {
    case "NoActivePass":
      return "You have no active pass. Grab one to check in.";
    case "PassExpired":
      return "Your pass has expired.";
    case "TopUpRequired":
      return "This gym is above your tier — a quick top-up unlocks it.";
    case "GymNotFound":
      return "We couldn't find that gym code.";
    case "InvalidOtpError":
      return "That code doesn't match. Try again.";
    case "OtpExpiredError":
      return "That code expired. Request a new one.";
    case "ChatLocked":
      return "Chat unlocks after you book a session.";
    default:
      return tag.replace(/([A-Z])/g, " $1").trim();
  }
};

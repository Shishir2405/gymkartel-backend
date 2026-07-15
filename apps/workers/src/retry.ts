/**
 * Pure retry policy shared by every consumer. Decides, from the current attempt
 * count (read off the AMQP x-death header), whether to RETRY (nack → dead-letter
 * to the delayed retry queue) or PARK (publish to the dead queue for a human).
 * Backoff is exponential, capped, and applied via per-queue message TTL.
 */
export const MAX_ATTEMPTS = 5;

export type RetryAction = "RETRY" | "PARK";

export const retryDecision = (
  attempts: number,
  maxAttempts = MAX_ATTEMPTS,
): RetryAction => (attempts + 1 >= maxAttempts ? "PARK" : "RETRY");

/** Exponential backoff (ms) for a given attempt, capped at 5 minutes. */
export const backoffMs = (attempt: number, baseMs = 5000): number =>
  Math.min(baseMs * 2 ** Math.max(0, attempt), 5 * 60 * 1000);

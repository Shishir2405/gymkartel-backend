export const MAX_ATTEMPTS = 5;

export type RetryAction = "RETRY" | "PARK";

export const retryDecision = (
  attempts: number,
  maxAttempts = MAX_ATTEMPTS,
): RetryAction => (attempts + 1 >= maxAttempts ? "PARK" : "RETRY");

export const backoffMs = (attempt: number, baseMs = 5000): number =>
  Math.min(baseMs * 2 ** Math.max(0, attempt), 5 * 60 * 1000);

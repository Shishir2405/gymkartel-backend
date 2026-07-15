import type { Pass } from "@gymkartel/contracts";

/**
 * Pure pass lifecycle rules. No I/O, no clock reads — the current time is
 * always passed in so streak/validity maths are deterministic and testable.
 */

/** Days still available: total + bonus − used, floored at zero. */
export const daysLeft = (pass: Pick<Pass, "daysTotal" | "bonusDays" | "daysUsed">): number =>
  Math.max(0, pass.daysTotal + pass.bonusDays - pass.daysUsed);

export const isWithinWindow = (pass: Pick<Pass, "validUntil">, now: Date): boolean =>
  now.getTime() <= new Date(pass.validUntil).getTime();

/** Derive the live status from stored counters + the window. */
export const deriveStatus = (
  pass: Pick<Pass, "daysTotal" | "bonusDays" | "daysUsed" | "validUntil">,
  now: Date,
): Pass["status"] => {
  if (!isWithinWindow(pass, now)) return "EXPIRED";
  if (daysLeft(pass) <= 0) return "EXHAUSTED";
  return "ACTIVE";
};

export const isUsable = (
  pass: Pick<Pass, "daysTotal" | "bonusDays" | "daysUsed" | "validUntil">,
  now: Date,
): boolean => deriveStatus(pass, now) === "ACTIVE";

/**
 * Roll-over on renew: unused days from an existing (still-valid) pass carry into
 * the new pack as bonus days ("your days wait for you"). Expired days are
 * forfeit. Returns the bonusDays to seed on the newly purchased pass.
 */
export const rolloverBonus = (
  previous: Pick<Pass, "daysTotal" | "bonusDays" | "daysUsed" | "validUntil"> | null,
  now: Date,
): number => {
  if (!previous) return 0;
  if (!isWithinWindow(previous, now)) return 0;
  return daysLeft(previous);
};

/** Validity window end for a freshly purchased pack: purchase + days + 5-day grace. */
export const computeValidUntil = (
  purchasedAt: Date,
  packDays: number,
  graceDays = 5,
): Date => {
  const ms = (packDays + graceDays) * 24 * 60 * 60 * 1000;
  return new Date(purchasedAt.getTime() + ms);
};

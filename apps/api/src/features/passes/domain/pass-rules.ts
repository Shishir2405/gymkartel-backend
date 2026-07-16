import type { Pass } from "@gymkartel/contracts";

export const daysLeft = (pass: Pick<Pass, "daysTotal" | "bonusDays" | "daysUsed">): number =>
  Math.max(0, pass.daysTotal + pass.bonusDays - pass.daysUsed);

export const isWithinWindow = (pass: Pick<Pass, "validUntil">, now: Date): boolean =>
  now.getTime() <= new Date(pass.validUntil).getTime();

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

export const rolloverBonus = (
  previous: Pick<Pass, "daysTotal" | "bonusDays" | "daysUsed" | "validUntil"> | null,
  now: Date,
): number => {
  if (!previous) return 0;
  if (!isWithinWindow(previous, now)) return 0;
  return daysLeft(previous);
};

export const computeValidUntil = (
  purchasedAt: Date,
  packDays: number,
  graceDays = 5,
): Date => {
  const ms = (packDays + graceDays) * 24 * 60 * 60 * 1000;
  return new Date(purchasedAt.getTime() + ms);
};

import { computeStreak } from "../../streaks-ranks/domain/streak.js";
import { rankForWeeks } from "../../streaks-ranks/domain/rank.js";
import type { ShareCardData } from "./render.js";

/** Format an instant as the card's date line, e.g. "15 JUL 2026" (UTC). */
export const formatCardDate = (at: Date): string => {
  const day = String(at.getUTCDate()).padStart(2, "0");
  const month = at.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  return `${day} ${month} ${at.getUTCFullYear()}`;
};

/**
 * Derive the marketing card data from a user's check-in history — pure, so it
 * is deterministic and unit-tested. `dayCount` is the total distinct training
 * days, `streakWeeks`/`rankLabel` come from the shared streak+rank domain.
 */
export const buildShareCardData = (input: {
  readonly gymName: string;
  readonly checkInInstants: readonly Date[];
  readonly now: Date;
}): ShareCardData => {
  const streak = computeStreak(input.checkInInstants, input.now);
  const rank = rankForWeeks(streak.weeks);
  const dayCount = new Set(
    input.checkInInstants.map((d) => d.toISOString().slice(0, 10)),
  ).size;
  return {
    gymName: input.gymName,
    dayCount,
    streakWeeks: streak.weeks,
    rankLabel: rank.label,
    date: formatCardDate(input.now),
  };
};

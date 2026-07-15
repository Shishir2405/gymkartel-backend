import { istDayNumber } from "./ist.js";

/**
 * Streak rules (Flow 7), stated by the brief:
 *   "train 3+ days in any 7 → alive; every 2 streak-weeks = +1 free day"
 *
 * We reduce all check-ins to distinct IST day-numbers, then reason in integer
 * 7-day blocks counting back from today. A block "qualifies" when it contains
 * ≥ 3 distinct training days. The current streak is the run of consecutive
 * qualifying blocks; the in-progress block (block 0) counts only once it has
 * already hit 3 so a slow week never retroactively deletes prior weeks.
 */

export const DAYS_PER_WEEK = 7;
export const MIN_DAYS_FOR_ALIVE = 3;
export const WEEKS_PER_BONUS_DAY = 2;

export interface StreakState {
  /** Consecutive qualifying 7-day blocks ending at today. */
  readonly weeks: number;
  /** True when the current rolling 7-day window already has ≥ 3 training days. */
  readonly alive: boolean;
  /** Distinct training days inside the current rolling 7-day window. */
  readonly daysThisWindow: number;
  /** Whole days until the streak is at risk (a training day exits the window). */
  readonly windowDaysLeft: number;
  /** Free days earned so far: floor(weeks / 2). */
  readonly bonusDaysEarned: number;
}

/** Distinct IST day-numbers, deduped and sorted ascending. */
export const toTrainingDays = (checkInInstants: readonly Date[]): number[] => {
  const set = new Set<number>();
  for (const d of checkInInstants) set.add(istDayNumber(d));
  return [...set].sort((a, b) => a - b);
};

const countInBlock = (
  days: readonly number[],
  hi: number, // inclusive newest day-number of the block
): number => {
  const lo = hi - (DAYS_PER_WEEK - 1);
  let n = 0;
  for (const d of days) if (d >= lo && d <= hi) n += 1;
  return n;
};

/** Distinct training days in the rolling window ending `today` (inclusive). */
export const daysInWindow = (days: readonly number[], today: number): number =>
  countInBlock(days, today);

export const bonusDaysForWeeks = (weeks: number): number =>
  Math.floor(weeks / WEEKS_PER_BONUS_DAY);

/**
 * Number of consecutive qualifying weekly blocks ending at `today`.
 * Block i covers [today-7i-6 .. today-7i].
 */
export const streakWeeks = (days: readonly number[], today: number): number => {
  if (days.length === 0) return 0;
  let weeks = 0;
  let i = 0;
  // Block 0 is in-progress: skip it if it hasn't qualified yet, but don't break.
  if (countInBlock(days, today) < MIN_DAYS_FOR_ALIVE) {
    i = 1;
  }
  for (;;) {
    const hi = today - DAYS_PER_WEEK * i;
    if (countInBlock(days, hi) >= MIN_DAYS_FOR_ALIVE) {
      weeks += 1;
      i += 1;
    } else {
      break;
    }
  }
  return weeks;
};

/**
 * Whole days until the streak is at risk. If already alive, this is when the
 * 3rd-most-recent in-window training day exits the 7-day window. If not alive,
 * the streak is at risk right now → 0.
 */
export const windowDaysLeft = (days: readonly number[], today: number): number => {
  const lo = today - (DAYS_PER_WEEK - 1);
  const inWindowDesc = days.filter((d) => d >= lo && d <= today).sort((a, b) => b - a);
  if (inWindowDesc.length < MIN_DAYS_FOR_ALIVE) return 0;
  const pivot = inWindowDesc[MIN_DAYS_FOR_ALIVE - 1]!; // 3rd most recent
  const exitsAt = pivot + DAYS_PER_WEEK; // day-number at which it leaves window
  return Math.max(0, exitsAt - today);
};

export const computeStreak = (
  checkInInstants: readonly Date[],
  now: Date,
): StreakState => {
  const days = toTrainingDays(checkInInstants);
  const today = istDayNumber(now);
  const weeks = streakWeeks(days, today);
  const daysThisWindow = daysInWindow(days, today);
  return {
    weeks,
    alive: daysThisWindow >= MIN_DAYS_FOR_ALIVE,
    daysThisWindow,
    windowDaysLeft: windowDaysLeft(days, today),
    bonusDaysEarned: bonusDaysForWeeks(weeks),
  };
};

/**
 * Bonus days newly grantable when crossing into a new even week count.
 * Given the previously-granted count, returns how many additional free days to
 * grant now (so the RabbitMQ recompute worker is idempotent).
 */
export const bonusDaysToGrant = (
  weeksNow: number,
  bonusAlreadyGranted: number,
): number => Math.max(0, bonusDaysForWeeks(weeksNow) - bonusAlreadyGranted);

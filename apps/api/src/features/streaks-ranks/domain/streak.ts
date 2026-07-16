import { istDayNumber } from "./ist.js";

export const DAYS_PER_WEEK = 7;
export const MIN_DAYS_FOR_ALIVE = 3;
export const WEEKS_PER_BONUS_DAY = 2;

export interface StreakState {
  readonly weeks: number;
  readonly alive: boolean;
  readonly daysThisWindow: number;
  readonly windowDaysLeft: number;
  readonly bonusDaysEarned: number;
}

export const toTrainingDays = (checkInInstants: readonly Date[]): number[] => {
  const set = new Set<number>();
  for (const d of checkInInstants) set.add(istDayNumber(d));
  return [...set].sort((a, b) => a - b);
};

const countInBlock = (
  days: readonly number[],
  hi: number,
): number => {
  const lo = hi - (DAYS_PER_WEEK - 1);
  let n = 0;
  for (const d of days) if (d >= lo && d <= hi) n += 1;
  return n;
};

export const daysInWindow = (days: readonly number[], today: number): number =>
  countInBlock(days, today);

export const bonusDaysForWeeks = (weeks: number): number =>
  Math.floor(weeks / WEEKS_PER_BONUS_DAY);

export const streakWeeks = (days: readonly number[], today: number): number => {
  if (days.length === 0) return 0;
  let weeks = 0;
  let i = 0;
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

export const windowDaysLeft = (days: readonly number[], today: number): number => {
  const lo = today - (DAYS_PER_WEEK - 1);
  const inWindowDesc = days.filter((d) => d >= lo && d <= today).sort((a, b) => b - a);
  if (inWindowDesc.length < MIN_DAYS_FOR_ALIVE) return 0;
  const pivot = inWindowDesc[MIN_DAYS_FOR_ALIVE - 1]!;
  const exitsAt = pivot + DAYS_PER_WEEK;
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

export const bonusDaysToGrant = (
  weeksNow: number,
  bonusAlreadyGranted: number,
): number => Math.max(0, bonusDaysForWeeks(weeksNow) - bonusAlreadyGranted);

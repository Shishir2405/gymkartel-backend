export const RANKS = [
  { key: "ROOKIE", label: "Rookie", minWeeks: 0 },
  { key: "REGULAR", label: "Regular", minWeeks: 2 },
  { key: "COMMITTED", label: "Committed", minWeeks: 4 },
  { key: "BEAST", label: "Beast", minWeeks: 8 },
  { key: "LEGEND", label: "Legend", minWeeks: 16 },
] as const;

export type RankKey = (typeof RANKS)[number]["key"];

export interface RankProgress {
  readonly current: RankKey;
  readonly label: string;
  readonly next: RankKey | null;
  readonly weeksToNext: number | null;
}

export const rankForWeeks = (weeks: number): RankProgress => {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (weeks >= RANKS[i]!.minWeeks) idx = i;
  }
  const current = RANKS[idx]!;
  const next = idx + 1 < RANKS.length ? RANKS[idx + 1]! : null;
  return {
    current: current.key,
    label: current.label,
    next: next ? next.key : null,
    weeksToNext: next ? Math.max(0, next.minWeeks - weeks) : null,
  };
};

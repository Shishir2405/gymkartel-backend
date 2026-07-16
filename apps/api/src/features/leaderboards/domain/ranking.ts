
export interface LeaderboardEntry {
  readonly userId: string;
  readonly displayName: string;
  readonly streak: number;
  readonly totalCheckIns: number;
}

export interface RankedEntry extends LeaderboardEntry {
  readonly position: number;
  readonly isSelf: boolean;
}

export const compareEntries = (a: LeaderboardEntry, b: LeaderboardEntry): number => {
  if (b.streak !== a.streak) return b.streak - a.streak;
  if (b.totalCheckIns !== a.totalCheckIns) return b.totalCheckIns - a.totalCheckIns;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
};

export const rankAll = (entries: readonly LeaderboardEntry[]): RankedEntry[] => {
  const sorted = [...entries].sort(compareEntries);
  return sorted.map((e, i) => ({ ...e, position: i + 1, isSelf: false }));
};

export interface LeaderboardView {
  readonly page: readonly RankedEntry[];
  readonly self: RankedEntry | null;
}

export const buildView = (
  entries: readonly LeaderboardEntry[],
  selfUserId: string,
  limit: number,
): LeaderboardView => {
  const ranked = rankAll(entries).map((e) => ({
    ...e,
    isSelf: e.userId === selfUserId,
  }));
  const page = ranked.slice(0, limit);
  const selfInPage = page.some((e) => e.isSelf);
  const self = selfInPage ? null : (ranked.find((e) => e.isSelf) ?? null);
  return { page, self };
};

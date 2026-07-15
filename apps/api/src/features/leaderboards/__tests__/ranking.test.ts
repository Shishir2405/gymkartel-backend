import { describe, it, expect } from "vitest";
import { buildView, rankAll, compareEntries } from "../domain/ranking.js";

const e = (userId: string, streak: number, totalCheckIns: number) => ({
  userId,
  displayName: userId,
  streak,
  totalCheckIns,
});

describe("leaderboard ranking (attendance only, never money)", () => {
  it("orders by streak then total check-ins then id", () => {
    const ranked = rankAll([e("c", 3, 10), e("a", 5, 2), e("b", 5, 9)]);
    expect(ranked.map((r) => r.userId)).toEqual(["b", "a", "c"]);
    expect(ranked[0]!.position).toBe(1);
  });

  it("compareEntries is a total order (transitive-ish sanity)", () => {
    expect(compareEntries(e("a", 5, 1), e("b", 4, 100))).toBeLessThan(0);
    expect(compareEntries(e("a", 4, 100), e("b", 4, 100))).toBeLessThan(0); // id tiebreak
  });

  it("keeps a sticky self-row when the viewer is off-page", () => {
    const entries = Array.from({ length: 50 }, (_, i) =>
      e(`u${String(i).padStart(2, "0")}`, 50 - i, 0),
    );
    const view = buildView(entries, "u40", 10);
    expect(view.page).toHaveLength(10);
    expect(view.page.some((r) => r.isSelf)).toBe(false);
    expect(view.self?.userId).toBe("u40");
    expect(view.self?.position).toBe(41);
  });

  it("omits the sticky row when the viewer is already on-page", () => {
    const entries = [e("a", 5, 0), e("b", 4, 0), e("c", 3, 0)];
    const view = buildView(entries, "b", 10);
    expect(view.self).toBeNull();
    expect(view.page.find((r) => r.userId === "b")?.isSelf).toBe(true);
  });
});

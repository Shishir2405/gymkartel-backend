import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  istDayNumber,
  istDayKey,
  istSeasonKey,
} from "../domain/ist.js";
import {
  computeStreak,
  streakWeeks,
  toTrainingDays,
  daysInWindow,
  bonusDaysForWeeks,
  bonusDaysToGrant,
  windowDaysLeft,
} from "../domain/streak.js";
import { rankForWeeks, RANKS } from "../domain/rank.js";

const ist = (y: number, m: number, d: number, hour = 12): Date =>
  new Date(Date.UTC(y, m - 1, d, hour - 5, 0 - 30));

describe("IST day boundaries", () => {
  it("assigns the same day-number across an IST calendar day", () => {
    const early = ist(2026, 3, 10, 0);
    const late = ist(2026, 3, 10, 23);
    expect(istDayNumber(early)).toBe(istDayNumber(late));
  });

  it("crosses to next day-number at IST midnight, not UTC midnight", () => {
    const before = ist(2026, 3, 10, 23) ;
    const after = ist(2026, 3, 11, 1);
    expect(istDayNumber(after)).toBe(istDayNumber(before) + 1);
  });

  it("18:30 UTC is already the next IST day", () => {
    const at = new Date(Date.UTC(2026, 2, 10, 18, 30));
    const justBefore = new Date(Date.UTC(2026, 2, 10, 18, 29));
    expect(istDayNumber(at)).toBe(istDayNumber(justBefore) + 1);
  });

  it("formats keys and seasons in IST", () => {
    expect(istDayKey(ist(2026, 3, 10, 12))).toBe("2026-03-10");
    expect(istSeasonKey(ist(2026, 3, 10, 12))).toBe("2026-03");
  });
});

describe("streakWeeks / alive", () => {
  const today = istDayNumber(ist(2026, 3, 30, 12));

  it("is not alive with fewer than 3 days in the window", () => {
    const days = [today, today - 1];
    expect(daysInWindow(days, today)).toBe(2);
    expect(streakWeeks(days, today)).toBe(0);
  });

  it("is alive with exactly 3 days in 7", () => {
    const days = [today, today - 2, today - 4];
    expect(daysInWindow(days, today)).toBe(3);
    expect(streakWeeks(days, today)).toBe(1);
  });

  it("counts consecutive qualifying weeks", () => {
    const days: number[] = [];
    for (let w = 0; w < 4; w += 1) {
      const base = today - w * 7;
      days.push(base, base - 2, base - 4);
    }
    expect(streakWeeks(days, today)).toBe(4);
  });

  it("does not break the streak if the in-progress week hasn't hit 3 yet", () => {
    const days: number[] = [];
    days.push(today);
    const prev = today - 7;
    days.push(prev, prev - 2, prev - 4);
    expect(streakWeeks(days, today)).toBe(1);
  });

  it("breaks the streak on a fully missed completed week", () => {
    const days: number[] = [];
    days.push(today, today - 2, today - 4);
    const w2 = today - 14;
    days.push(w2, w2 - 2, w2 - 4);
    expect(streakWeeks(days, today)).toBe(1);
  });
});

describe("bonus days", () => {
  it("grants one free day per two streak-weeks", () => {
    expect(bonusDaysForWeeks(0)).toBe(0);
    expect(bonusDaysForWeeks(1)).toBe(0);
    expect(bonusDaysForWeeks(2)).toBe(1);
    expect(bonusDaysForWeeks(5)).toBe(2);
    expect(bonusDaysForWeeks(6)).toBe(3);
  });

  it("bonusDaysToGrant is idempotent against already-granted count", () => {
    expect(bonusDaysToGrant(6, 3)).toBe(0);
    expect(bonusDaysToGrant(6, 2)).toBe(1);
    expect(bonusDaysToGrant(2, 0)).toBe(1);
  });
});

describe("windowDaysLeft", () => {
  const today = istDayNumber(ist(2026, 3, 30, 12));
  it("is 0 when not alive (at risk now)", () => {
    expect(windowDaysLeft([today, today - 1], today)).toBe(0);
  });
  it("counts until the 3rd-most-recent day exits the 7-day window", () => {
    const days = [today, today - 1, today - 6];
    expect(windowDaysLeft(days, today)).toBe(1);
  });
});

describe("rank ladder", () => {
  it("maps weeks to public ranks", () => {
    expect(rankForWeeks(0).current).toBe("ROOKIE");
    expect(rankForWeeks(2).current).toBe("REGULAR");
    expect(rankForWeeks(4).current).toBe("COMMITTED");
    expect(rankForWeeks(8).current).toBe("BEAST");
    expect(rankForWeeks(100).current).toBe("LEGEND");
  });
  it("reports weeks to next rank", () => {
    expect(rankForWeeks(0).weeksToNext).toBe(2);
    expect(rankForWeeks(3).weeksToNext).toBe(1);
    expect(rankForWeeks(16).next).toBeNull();
  });
});

describe("property: streak logic is stable and bounded", () => {
  it("streakWeeks never exceeds the number of distinct training days", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -400, max: 0 }), { maxLength: 200 }),
        (offsets) => {
          const today = 20000;
          const days = toTrainingDays(offsets.map((o) => new Date((today + o) * 86400000)));
          const dayNums = [...new Set(offsets.map((o) => today + o))].sort((a, b) => a - b);
          const weeks = streakWeeks(dayNums, today);
          expect(weeks).toBeLessThanOrEqual(dayNums.length);
          expect(weeks).toBeGreaterThanOrEqual(0);
          void days;
        },
      ),
    );
  });

  it("computeStreak.alive iff >=3 distinct IST days in last 7", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 20 }), (back) => {
        const now = ist(2026, 5, 20, 12);
        const instants = back.map((b) => ist(2026, 5, 20 - b, 10));
        const s = computeStreak(instants, now);
        const distinct = new Set(back).size;
        expect(s.alive).toBe(distinct >= 3);
      }),
    );
  });

  it("rank thresholds are monotonic", () => {
    for (let i = 1; i < RANKS.length; i += 1) {
      expect(RANKS[i]!.minWeeks).toBeGreaterThan(RANKS[i - 1]!.minWeeks);
    }
  });
});

import { describe, it, expect } from "vitest";
import { passPrice, passPerDayPrice, PASS_PACK_DAYS } from "@gymkartel/contracts";
import { buildLadder } from "../domain/ladder.js";
import {
  daysLeft,
  deriveStatus,
  rolloverBonus,
  computeValidUntil,
  isUsable,
} from "../domain/pass-rules.js";

describe("pass ladder pricing (single source of truth)", () => {
  it("uses contracts pricing verbatim — nothing hardcoded", () => {
    const ladder = buildLadder("STANDARD");
    for (const row of ladder) {
      expect(row.pricePaise).toBe(passPrice("STANDARD", row.pack));
      expect(row.perDayPaise).toBe(passPerDayPrice("STANDARD", row.pack));
      expect(row.days).toBe(PASS_PACK_DAYS[row.pack]);
    }
  });

  it("15-day is the emphasized MOST_CHOSEN and per-day beats the 7-day decoy", () => {
    const ladder = buildLadder("BASIC");
    const seven = ladder.find((r) => r.pack === "SEVEN_DAY")!;
    const fifteen = ladder.find((r) => r.pack === "FIFTEEN_DAY")!;
    expect(fifteen.badge).toBe("MOST_CHOSEN");
    expect(fifteen.emphasized).toBe(true);
    expect(fifteen.perDayPaise).toBeLessThan(seven.perDayPaise);
  });

  it("30-day is the BEST_RATE with the lowest per-day", () => {
    const ladder = buildLadder("PREMIUM");
    const perDays = ladder.map((r) => r.perDayPaise);
    const thirty = ladder.find((r) => r.pack === "THIRTY_DAY")!;
    expect(thirty.badge).toBe("BEST_RATE");
    expect(Math.min(...perDays)).toBe(thirty.perDayPaise);
  });
});

describe("pass lifecycle rules", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");

  it("daysLeft accounts for bonus days and never goes negative", () => {
    expect(daysLeft({ daysTotal: 15, bonusDays: 2, daysUsed: 5 })).toBe(12);
    expect(daysLeft({ daysTotal: 5, bonusDays: 0, daysUsed: 9 })).toBe(0);
  });

  it("derives status from window + counters", () => {
    const active = { daysTotal: 15, bonusDays: 0, daysUsed: 3, validUntil: "2026-03-30T00:00:00.000Z" };
    const exhausted = { daysTotal: 3, bonusDays: 0, daysUsed: 3, validUntil: "2026-03-30T00:00:00.000Z" };
    const expired = { daysTotal: 15, bonusDays: 0, daysUsed: 3, validUntil: "2026-03-01T00:00:00.000Z" };
    expect(deriveStatus(active, now)).toBe("ACTIVE");
    expect(deriveStatus(exhausted, now)).toBe("EXHAUSTED");
    expect(deriveStatus(expired, now)).toBe("EXPIRED");
    expect(isUsable(active, now)).toBe(true);
    expect(isUsable(expired, now)).toBe(false);
  });

  it("rolls over unused days from a still-valid pass, forfeits expired ones", () => {
    const valid = { daysTotal: 15, bonusDays: 1, daysUsed: 10, validUntil: "2026-03-30T00:00:00.000Z" };
    const expired = { daysTotal: 15, bonusDays: 1, daysUsed: 10, validUntil: "2026-03-01T00:00:00.000Z" };
    expect(rolloverBonus(valid, now)).toBe(6);
    expect(rolloverBonus(expired, now)).toBe(0);
    expect(rolloverBonus(null, now)).toBe(0);
  });

  it("computes a validity window with grace", () => {
    const end = computeValidUntil(new Date("2026-03-01T00:00:00.000Z"), 15, 5);
    expect(end.toISOString()).toBe("2026-03-21T00:00:00.000Z");
  });
});

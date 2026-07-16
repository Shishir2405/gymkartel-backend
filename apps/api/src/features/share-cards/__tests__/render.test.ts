import { describe, it, expect } from "vitest";
import { renderShareCard, type ShareCardData } from "../domain/render.js";
import { buildShareCardData, formatCardDate } from "../domain/card-data.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const sample: ShareCardData = {
  gymName: "Iron Temple",
  dayCount: 27,
  streakWeeks: 6,
  rankLabel: "Committed",
  date: "15 JUL 2026",
};

describe("share-card render (satori + resvg)", () => {
  it("renders a non-empty PNG with the PNG magic header", async () => {
    const png = await renderShareCard(sample);
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it("renders large numeral cards without throwing", async () => {
    const png = await renderShareCard({ ...sample, dayCount: 365, streakWeeks: 52 });
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("derives card data from check-in history (pure)", () => {
    const now = new Date("2026-06-08T10:00:00Z");
    const data = buildShareCardData({
      gymName: "Iron Temple",
      checkInInstants: [
        new Date("2026-06-02T10:00:00Z"),
        new Date("2026-06-04T10:00:00Z"),
        new Date("2026-06-06T10:00:00Z"),
      ],
      now,
    });
    expect(data.dayCount).toBe(3);
    expect(data.gymName).toBe("Iron Temple");
    expect(data.rankLabel.length).toBeGreaterThan(0);
    expect(formatCardDate(now)).toBe("08 JUN 2026");
  });
});

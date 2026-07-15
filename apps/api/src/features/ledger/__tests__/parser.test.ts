import { describe, it, expect } from "vitest";
import { parseWorkout, isPersonalRecord } from "../domain/parser.js";

describe("workout parser (Flow 6 — never silently guess)", () => {
  it("parses strength with explicit kg", () => {
    const [entry] = parseWorkout("bench 3x8 60kg");
    expect(entry).toMatchObject({
      kind: "STRENGTH",
      exercise: "bench",
      sets: 3,
      reps: 8,
      weightKg: 60,
      uncertain: false,
    });
  });

  it("flags weight without a unit as uncertain (amber ?), never silent", () => {
    const [entry] = parseWorkout("squat 5x5 100");
    expect(entry).toMatchObject({ kind: "STRENGTH", weightKg: 100, uncertain: true });
    if (entry && entry.kind === "STRENGTH") expect(entry.note).toBeTruthy();
  });

  it("parses cardio distance", () => {
    const [entry] = parseWorkout("run 5km");
    expect(entry).toMatchObject({ kind: "CARDIO", exercise: "run", distanceKm: 5 });
  });

  it("marks unparseable segments UNKNOWN + uncertain", () => {
    const [entry] = parseWorkout("did some stuff");
    expect(entry).toMatchObject({ kind: "UNKNOWN", uncertain: true });
  });

  it("splits multiple comma-separated entries", () => {
    const entries = parseWorkout("bench 3x8 60kg, run 5km, squat 5x5 100kg");
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.kind)).toEqual(["STRENGTH", "CARDIO", "STRENGTH"]);
  });

  it("detects personal records", () => {
    expect(isPersonalRecord(100, 90)).toBe(true);
    expect(isPersonalRecord(80, 90)).toBe(false);
    expect(isPersonalRecord(50, null)).toBe(true);
    expect(isPersonalRecord(null, 90)).toBe(false);
  });
});

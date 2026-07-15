/**
 * Asia/Kolkata calendar-day maths. IST is a fixed +05:30 offset with no DST,
 * so a "training day" is unambiguous: two check-ins belong to the same streak
 * day iff they fall on the same IST calendar date. We reduce every instant to
 * an integer IST day-number so all downstream streak logic is pure integer
 * arithmetic (no Date timezone surprises).
 */

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30
const DAY_MS = 24 * 60 * 60 * 1000;

/** Integer count of IST calendar days since the Unix epoch (IST). */
export const istDayNumber = (instant: Date): number =>
  Math.floor((instant.getTime() + IST_OFFSET_MS) / DAY_MS);

/** `YYYY-MM-DD` in IST for display / storage keys. */
export const istDayKey = (instant: Date): string => {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** The UTC instant of IST-midnight that begins the given day-number. */
export const istDayStart = (dayNumber: number): Date =>
  new Date(dayNumber * DAY_MS - IST_OFFSET_MS);

/** IST month key `YYYY-MM` — the leaderboard season boundary. */
export const istSeasonKey = (instant: Date): string => istDayKey(instant).slice(0, 7);

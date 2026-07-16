
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const istDayNumber = (instant: Date): number =>
  Math.floor((instant.getTime() + IST_OFFSET_MS) / DAY_MS);

export const istDayKey = (instant: Date): string => {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const istDayStart = (dayNumber: number): Date =>
  new Date(dayNumber * DAY_MS - IST_OFFSET_MS);

export const istSeasonKey = (instant: Date): string => istDayKey(instant).slice(0, 7);

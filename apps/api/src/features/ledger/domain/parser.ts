
export interface StrengthEntry {
  readonly kind: "STRENGTH";
  readonly exercise: string;
  readonly sets: number;
  readonly reps: number;
  readonly weightKg: number | null;
  readonly uncertain: boolean;
  readonly note?: string;
  readonly raw: string;
}

export interface CardioEntry {
  readonly kind: "CARDIO";
  readonly exercise: string;
  readonly distanceKm: number | null;
  readonly durationMin: number | null;
  readonly uncertain: boolean;
  readonly note?: string;
  readonly raw: string;
}

export interface UnknownEntry {
  readonly kind: "UNKNOWN";
  readonly uncertain: true;
  readonly note: string;
  readonly raw: string;
}

export type WorkoutEntry = StrengthEntry | CardioEntry | UnknownEntry;

const CARDIO_WORDS = new Set([
  "run",
  "running",
  "jog",
  "walk",
  "cycle",
  "cycling",
  "row",
  "rowing",
  "swim",
  "swimming",
  "elliptical",
]);

const SETS_REPS_RE = /^(\d{1,2})\s*[x×]\s*(\d{1,3})$/i;
const WEIGHT_RE = /^(\d{1,3}(?:\.\d)?)\s*(kg|kgs)?$/i;
const DISTANCE_RE = /^(\d{1,3}(?:\.\d+)?)\s*(km|k|m|mi)$/i;
const DURATION_RE = /^(\d{1,3})\s*(min|mins|m|sec|s)$/i;

const splitSegments = (input: string): string[] =>
  input
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const parseStrength = (
  exercise: string,
  rest: string[],
  raw: string,
): StrengthEntry | null => {
  let sets: number | null = null;
  let reps: number | null = null;
  let weightKg: number | null = null;
  let sawWeightUnit = false;

  for (const tok of rest) {
    const sr = SETS_REPS_RE.exec(tok);
    if (sr) {
      sets = Number(sr[1]);
      reps = Number(sr[2]);
      continue;
    }
    const w = WEIGHT_RE.exec(tok);
    if (w && /\d/.test(tok)) {
      weightKg = Number(w[1]);
      if (w[2]) sawWeightUnit = true;
      continue;
    }
  }
  if (sets === null || reps === null) return null;
  return {
    kind: "STRENGTH",
    exercise,
    sets,
    reps,
    weightKg,
    uncertain: weightKg !== null && !sawWeightUnit,
    ...(weightKg !== null && !sawWeightUnit
      ? { note: "Assumed kg — tap to confirm" }
      : {}),
    raw,
  };
};

const parseCardio = (exercise: string, rest: string[], raw: string): CardioEntry => {
  let distanceKm: number | null = null;
  let durationMin: number | null = null;
  let uncertain = false;
  let note: string | undefined;

  for (const tok of rest) {
    const d = DISTANCE_RE.exec(tok);
    if (d) {
      const val = Number(d[1]);
      const unit = d[2]!.toLowerCase();
      if (unit === "m") distanceKm = val / 1000;
      else if (unit === "mi") {
        distanceKm = val * 1.60934;
        uncertain = true;
        note = "Converted miles→km";
      } else distanceKm = val;
      continue;
    }
    const t = DURATION_RE.exec(tok);
    if (t) {
      const val = Number(t[1]);
      const unit = t[2]!.toLowerCase();
      durationMin = unit.startsWith("s") ? val / 60 : val;
      continue;
    }
  }
  if (distanceKm === null && durationMin === null) {
    uncertain = true;
    note = note ?? "No distance or duration recognised";
  }
  return {
    kind: "CARDIO",
    exercise,
    distanceKm,
    durationMin,
    uncertain,
    ...(note ? { note } : {}),
    raw,
  };
};

export const parseWorkout = (input: string): WorkoutEntry[] =>
  splitSegments(input).map((segment): WorkoutEntry => {
    const tokens = segment.split(/\s+/).filter(Boolean);
    const first = tokens[0];
    if (!first) {
      return { kind: "UNKNOWN", uncertain: true, note: "Empty entry", raw: segment };
    }
    const exercise = first.toLowerCase();
    const rest = tokens.slice(1);

    if (CARDIO_WORDS.has(exercise)) {
      return parseCardio(exercise, rest, segment);
    }
    const strength = parseStrength(exercise, rest, segment);
    if (strength) return strength;

    return {
      kind: "UNKNOWN",
      uncertain: true,
      note: "Couldn't read sets×reps — tap to edit",
      raw: segment,
    };
  });

export const isPersonalRecord = (
  weightKg: number | null,
  priorBestKg: number | null,
): boolean => weightKg !== null && (priorBestKg === null || weightKg > priorBestKg);

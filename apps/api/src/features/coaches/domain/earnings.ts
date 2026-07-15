import { COACH_TAKE_RATE, type Paise } from "@gymkartel/contracts";

/**
 * Coach earnings preview (Flow 5). The coach keeps COACH_TAKE_RATE of the
 * session price; the take-home is DERIVED, never stored. Rounded to whole paise.
 */
export const takeHomePaise = (pricePerSession: Paise): Paise =>
  Math.round(pricePerSession * COACH_TAKE_RATE) as Paise;

export const platformFeePaise = (pricePerSession: Paise): Paise =>
  (pricePerSession - takeHomePaise(pricePerSession)) as Paise;

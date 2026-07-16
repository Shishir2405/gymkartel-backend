import { COACH_TAKE_RATE, type Paise } from "@gymkartel/contracts";

export const takeHomePaise = (pricePerSession: Paise): Paise =>
  Math.round(pricePerSession * COACH_TAKE_RATE) as Paise;

export const platformFeePaise = (pricePerSession: Paise): Paise =>
  (pricePerSession - takeHomePaise(pricePerSession)) as Paise;

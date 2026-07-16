import {
  PASS_LADDER,
  PASS_PACK_DAYS,
  passPrice,
  passPerDayPrice,
  type PassPack,
  type Tier,
} from "@gymkartel/contracts";

export interface LadderRow {
  readonly pack: PassPack;
  readonly days: number;
  readonly pricePaise: number;
  readonly perDayPaise: number;
  readonly badge: "MOST_CHOSEN" | "BEST_RATE" | null;
  readonly rankMultiplier: number | null;
  readonly emphasized: boolean;
}

export const buildLadder = (tier: Tier): readonly LadderRow[] =>
  PASS_LADDER.map((row) => ({
    pack: row.pack,
    days: row.days,
    pricePaise: passPrice(tier, row.pack),
    perDayPaise: passPerDayPrice(tier, row.pack),
    badge: row.badge ?? null,
    rankMultiplier: row.rankMultiplier ?? null,
    emphasized: row.emphasized ?? false,
  }));

export const packDays = (pack: PassPack): number => PASS_PACK_DAYS[pack];

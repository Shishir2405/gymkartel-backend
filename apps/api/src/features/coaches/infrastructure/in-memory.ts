import { Layer } from "effect";
import type { Coach } from "@gymkartel/contracts";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { CoachRepo } from "../application/coach-repo.js";

/**
 * The Coach contract has no gender field, so `femaleOnly` filters on a
 * specialty marker ("women"/"female") — an explicit product convention, noted
 * here rather than guessed silently.
 */
const matchesFemaleOnly = (coach: Coach): boolean =>
  coach.specialties.some((s) => /female|women/i.test(s));

export const CoachRepoMemory = (seed: readonly Coach[] = []): Layer.Layer<CoachRepo> =>
  Layer.sync(CoachRepo, () => {
    const col = new InMemoryCollection<Coach>((c) => c.id, seed);
    return {
      getById: (id) => col.get(id),
      list: (filter) =>
        col.filter((c) => {
          if (filter.verifiedOnly && !c.verified) return false;
          if (filter.specialty && !c.specialties.some((s) => s.includes(filter.specialty!)))
            return false;
          if (filter.maxPricePaise !== undefined && c.pricePerSession > filter.maxPricePaise)
            return false;
          if (filter.femaleOnly && !matchesFemaleOnly(c)) return false;
          return true;
        }),
      update: (id, patch) => col.update(id, patch),
    };
  });

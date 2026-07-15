import { Effect, Layer } from "effect";
import { TIER_RANK, type Gym } from "@gymkartel/contracts";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { GymRepo } from "../application/gym-repo.js";

export const GymRepoMemory = (seed: readonly Gym[] = []): Layer.Layer<GymRepo> =>
  Layer.sync(GymRepo, () => {
    const col = new InMemoryCollection<Gym>((g) => g.id, seed);
    return {
      getById: (id) => col.get(id),
      getByCheckInCode: (code) => col.find((g) => g.checkInCode === code),
      list: (query) =>
        col.filter((g) => {
          if (query.zone && g.zone !== query.zone) return false;
          if (query.tier && !query.includeOtherTiers && g.tier !== query.tier)
            return false;
          // When peeking other tiers we still hide gyms far above the viewer's.
          if (query.tier && query.includeOtherTiers) {
            if (TIER_RANK[g.tier] > TIER_RANK[query.tier] + 1) return false;
          }
          return true;
        }),
      setLiveBusyFraction: (id, fraction) =>
        col.update(id, (g) => ({ ...g, liveBusyFraction: fraction })),
    };
  });

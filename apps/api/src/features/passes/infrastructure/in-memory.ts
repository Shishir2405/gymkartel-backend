import { Effect, Layer } from "effect";
import type { Pass } from "@gymkartel/contracts";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { daysLeft } from "../domain/pass-rules.js";
import { PassRepo } from "../application/pass-repo.js";

export const PassRepoMemory = (seed: readonly Pass[] = []): Layer.Layer<PassRepo> =>
  Layer.sync(PassRepo, () => {
    const col = new InMemoryCollection<Pass>((p) => p.id, seed);
    return {
      getById: (id) => col.get(id),
      latestForUser: (userId) =>
        Effect.gen(function* () {
          const rows = yield* col.filter((p) => p.userId === userId);
          rows.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
          return rows[0] ?? null;
        }),
      // Status-only: the window/expiry check is the service's job (injected
      // clock), so time-travel tests and rollovers stay deterministic.
      activeForUser: (userId) =>
        col.find((p) => p.userId === userId && p.status === "ACTIVE" && daysLeft(p) > 0),
      insert: (pass) => col.insert(pass),
      update: (id, patch) => col.update(id, patch),
      findByOrderId: (orderId) => col.find((p) => p.orderId === orderId),
    };
  });

import { Layer } from "effect";
import type { User } from "@gymkartel/contracts";
import { InMemoryCollection } from "../../../shared/persistence/in-memory.js";
import { UserRepo } from "../application/user-repo.js";

/** In-memory user repository. Seeded with fixtures for tests / local runtime. */
export const UserRepoMemory = (seed: readonly User[] = []): Layer.Layer<UserRepo> =>
  Layer.sync(UserRepo, () => {
    const col = new InMemoryCollection<User>((u) => u.id, seed);
    return {
      findById: (id) => col.get(id),
      findByPhone: (phone) => col.find((u) => u.phone === phone),
      insert: (user) => col.insert(user),
      update: (id, patch) => col.update(id, patch),
    };
  });

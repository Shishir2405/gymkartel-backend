import { Effect } from "effect";
import { DatabaseError } from "../errors/errors.js";

/**
 * Tiny in-memory collection used to back port implementations for tests and the
 * infra-free local runtime. Mirrors the subset of repo operations features
 * need. Production repositories use the Mongo adapter instead; both satisfy the
 * same Effect port so services never know which is wired.
 */
export class InMemoryCollection<T> {
  private readonly rows = new Map<string, T>();

  constructor(
    private readonly keyOf: (row: T) => string,
    seed: readonly T[] = [],
  ) {
    for (const r of seed) this.rows.set(keyOf(r), r);
  }

  insert(row: T): Effect.Effect<T, DatabaseError> {
    return Effect.sync(() => {
      this.rows.set(this.keyOf(row), row);
      return row;
    });
  }

  get(key: string): Effect.Effect<T | null, DatabaseError> {
    return Effect.sync(() => this.rows.get(key) ?? null);
  }

  find(predicate: (row: T) => boolean): Effect.Effect<T | null, DatabaseError> {
    return Effect.sync(() => {
      for (const r of this.rows.values()) if (predicate(r)) return r;
      return null;
    });
  }

  filter(predicate: (row: T) => boolean): Effect.Effect<T[], DatabaseError> {
    return Effect.sync(() => [...this.rows.values()].filter(predicate));
  }

  all(): Effect.Effect<T[], DatabaseError> {
    return Effect.sync(() => [...this.rows.values()]);
  }

  update(
    key: string,
    patch: (row: T) => T,
  ): Effect.Effect<T | null, DatabaseError> {
    return Effect.sync(() => {
      const existing = this.rows.get(key);
      if (!existing) return null;
      const next = patch(existing);
      this.rows.set(key, next);
      return next;
    });
  }

  size(): number {
    return this.rows.size;
  }
}

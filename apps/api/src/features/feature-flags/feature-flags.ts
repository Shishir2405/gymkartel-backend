import { Context, Effect, Layer } from "effect";
import type { DatabaseError } from "../../shared/errors/errors.js";

export interface FeatureFlagKey {
  readonly key: string;
  readonly enabled: boolean;
}

export interface FeatureFlagsApi {
  readonly isEnabled: (
    key: string,
    fallback?: boolean,
  ) => Effect.Effect<boolean, DatabaseError>;
  readonly set: (key: string, enabled: boolean) => Effect.Effect<void, DatabaseError>;
  readonly all: () => Effect.Effect<FeatureFlagKey[], DatabaseError>;
}

export class FeatureFlags extends Context.Tag("features/FeatureFlags")<
  FeatureFlags,
  FeatureFlagsApi
>() {}

export const FeatureFlagsMemory = (
  seed: Readonly<Record<string, boolean>> = {},
): Layer.Layer<FeatureFlags> =>
  Layer.sync(FeatureFlags, () => {
    const flags = new Map<string, boolean>(Object.entries(seed));
    return {
      isEnabled: (key, fallback = false) =>
        Effect.sync(() => flags.get(key) ?? fallback),
      set: (key, enabled) =>
        Effect.sync(() => {
          flags.set(key, enabled);
        }),
      all: () =>
        Effect.sync(() =>
          [...flags.entries()].map(([key, enabled]) => ({ key, enabled })),
        ),
    };
  });

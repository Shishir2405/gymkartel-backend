import { Effect } from "effect";
import { FeatureFlags } from "../features/feature-flags/feature-flags.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

/**
 * Feature flags visible to the viewer. Returns every known flag with its current
 * state so the app can gate UI without a round-trip per flag. Reads are
 * cache-first inside the FeatureFlags port.
 */
export const featureFlagResolvers = {
  Query: {
    featureFlags: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        FeatureFlags.pipe(Effect.flatMap((flags) => flags.all())),
      );
    },
  },
};

import { Effect } from "effect";
import { FeatureFlags } from "../features/feature-flags/feature-flags.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

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

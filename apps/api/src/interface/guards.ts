import { Effect } from "effect";
import { createGraphQLError } from "graphql-yoga";
import type { Coach } from "@gymkartel/contracts";
import { CoachRepo } from "../features/coaches/application/coach-repo.js";
import { CoachNotFound } from "../features/coaches/application/errors.js";
import type { DatabaseError } from "../shared/errors/errors.js";
import type { GraphQLContext, Viewer } from "./context.js";

export const requireViewer = (ctx: GraphQLContext): Viewer => {
  if (!ctx.viewer) {
    throw createGraphQLError("Sign in to continue", {
      extensions: { code: "UNAUTHENTICATED", status: 401 },
    });
  }
  return ctx.viewer;
};

export const requireCoach = (ctx: GraphQLContext): Viewer => {
  const viewer = requireViewer(ctx);
  if (viewer.role !== "COACH") {
    throw createGraphQLError("Coaches only", {
      extensions: { code: "FORBIDDEN", status: 403 },
    });
  }
  return viewer;
};

export const coachForViewer = (
  viewerId: string,
): Effect.Effect<Coach, CoachNotFound | DatabaseError, CoachRepo> =>
  CoachRepo.pipe(
    Effect.flatMap((repo) => repo.list({})),
    Effect.flatMap((coaches) => {
      const mine = coaches.find((c) => c.userId === viewerId);
      return mine
        ? Effect.succeed(mine)
        : Effect.fail(new CoachNotFound({ coachId: viewerId }));
    }),
  );

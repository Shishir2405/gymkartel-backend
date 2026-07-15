import { Effect } from "effect";
import type { UserId, UserRole } from "@gymkartel/contracts";
import { TokenService } from "../shared/auth/tokens.js";
import { UserRepo } from "../features/onboarding/application/user-repo.js";
import { toGraphQLError } from "../shared/errors/errors.js";
import { appRuntime, type AppRuntime, type AppServices } from "../runtime/runtime.js";

export interface Viewer {
  readonly id: UserId;
  readonly role: UserRole;
}

export interface GraphQLContext {
  readonly runtime: AppRuntime;
  readonly viewer: Viewer | null;
  readonly requestId: string;
}

/**
 * Resolve the viewer from a Bearer access token. Invalid/absent tokens yield a
 * null viewer (anonymous) rather than an error — field-level auth is enforced by
 * `requireViewer` in the resolvers that need it.
 */
export const resolveViewer = async (
  authHeader: string | undefined,
): Promise<Viewer | null> => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  const result = await appRuntime.runPromise(
    TokenService.pipe(
      Effect.flatMap((svc) => svc.verifyAccess(token)),
      Effect.map((claims): Viewer => ({ id: claims.sub, role: claims.role })),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
  );
  return result;
};

/**
 * Run an Effect on the app runtime, surfacing typed failures as GraphQL errors
 * with extension codes. This is the ONLY place domain errors cross into the HTTP
 * boundary — the edge adapter pattern the brief requires.
 */
export const runResolver = async <A, E>(
  runtime: AppRuntime,
  effect: Effect.Effect<A, E, AppServices>,
): Promise<A> => {
  const either = await runtime.runPromise(Effect.either(effect));
  if (either._tag === "Left") {
    throw toGraphQLError(either.left);
  }
  return either.right;
};

/** Load the full viewer User document (for the `viewer` query). */
export const loadViewerUser = (viewerId: UserId) =>
  UserRepo.pipe(Effect.flatMap((repo) => repo.findById(viewerId)));

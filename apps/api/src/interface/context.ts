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

export const loadViewerUser = (viewerId: UserId) =>
  UserRepo.pipe(Effect.flatMap((repo) => repo.findById(viewerId)));

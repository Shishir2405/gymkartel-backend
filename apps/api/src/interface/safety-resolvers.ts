import { Effect } from "effect";
import { SafetyService } from "../features/safety/application/safety-service.js";
import { UserRepo } from "../features/onboarding/application/user-repo.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

/**
 * Safety (SOS) resolvers. This is the plain, non-themed safety surface: trigger
 * SOS, set/read the trusted contact, and list the viewer's incidents. All logic
 * (trusted-contact requirement, escalation) lives in SafetyService — resolvers
 * only adapt shapes and enforce authentication.
 */
export const safetyResolvers = {
  Query: {
    incidents: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        SafetyService.pipe(Effect.flatMap((s) => s.incidents(viewer.id))),
      );
    },

    trustedContact: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        UserRepo.pipe(
          Effect.flatMap((repo) => repo.findById(viewer.id)),
          Effect.map((user) => user?.trustedContact ?? null),
        ),
      );
    },
  },

  Mutation: {
    triggerSos: (
      _p: unknown,
      args: {
        input: {
          kind: "CALL_EMERGENCY" | "ALERT_TRUSTED_CONTACT" | "REPORT_INCIDENT";
          note?: string | null;
          location?: { lat: number; lng: number } | null;
        };
      },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        SafetyService.pipe(
          Effect.flatMap((s) =>
            s.sos({
              userId: viewer.id,
              kind: args.input.kind,
              ...(args.input.note != null ? { note: args.input.note } : {}),
              ...(args.input.location != null
                ? { location: args.input.location }
                : {}),
            }),
          ),
        ),
      );
    },

    setTrustedContact: (
      _p: unknown,
      args: { input: { name: string; phone: string } },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        SafetyService.pipe(
          Effect.flatMap((s) =>
            s.setTrustedContact(viewer.id, args.input.name, args.input.phone),
          ),
          Effect.as(true),
        ),
      );
    },
  },
};

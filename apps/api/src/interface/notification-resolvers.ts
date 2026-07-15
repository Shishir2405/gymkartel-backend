import { Effect } from "effect";
import { NotificationInbox } from "../features/notifications/application/inbox.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";

/**
 * In-app notification inbox (the "Intel" feed) + push-token registration.
 * Distinct from the outbound NotificationService (SMS/EMAIL/PUSH) — this is the
 * member-facing list with read-state.
 */
export const notificationResolvers = {
  Query: {
    notifications: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        NotificationInbox.pipe(Effect.flatMap((inbox) => inbox.list(viewer.id))),
      );
    },
  },

  Mutation: {
    markNotificationRead: (
      _p: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        NotificationInbox.pipe(
          Effect.flatMap((inbox) => inbox.markRead(viewer.id, args.id)),
        ),
      );
    },

    registerPushToken: (
      _p: unknown,
      args: { token: string },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        NotificationInbox.pipe(
          Effect.flatMap((inbox) =>
            inbox.registerPushToken(viewer.id, args.token),
          ),
          Effect.as(true),
        ),
      );
    },
  },
};

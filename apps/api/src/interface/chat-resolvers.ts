import { Effect } from "effect";
import type { BookingId } from "@gymkartel/contracts";
import { ChatService, type ChatMessage } from "../features/chat/application/chat-service.js";
import { BookingRepo } from "../features/bookings/application/booking-repo.js";
import { CoachRepo } from "../features/coaches/application/coach-repo.js";
import { GymRepo } from "../features/gyms/application/gym-repo.js";
import { runResolver, type GraphQLContext } from "./context.js";
import { requireViewer } from "./guards.js";
import { pubSub, chatTopic } from "./pubsub.js";

/**
 * Chat resolvers. PII masking already happens inside ChatService.send (both
 * directions) — resolvers only ever surface the masked `text`, never the raw
 * input. Threads exist only post-booking (chatUnlockedAt), so the inbox is
 * derived from the viewer's unlocked bookings.
 */
export const chatResolvers = {
  Query: {
    chatInbox: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        Effect.gen(function* () {
          const bookingRepo = yield* BookingRepo;
          const coachRepo = yield* CoachRepo;
          const gymRepo = yield* GymRepo;
          const chat = yield* ChatService;
          const bookings = yield* bookingRepo.forMember(viewer.id);
          const unlocked = bookings.filter((b) => b.chatUnlockedAt != null);
          const threads = [];
          for (const b of unlocked) {
            const coach = yield* coachRepo.getById(b.coachId);
            const gym = yield* gymRepo.getById(b.gymId);
            const history = yield* chat.history(b.id);
            threads.push({
              bookingId: b.id,
              coach,
              gym,
              chatUnlocked: true,
              lastMessage: history.length ? history[history.length - 1] : null,
            });
          }
          return threads;
        }),
      );
    },

    chatThread: (
      _p: unknown,
      args: { bookingId: string },
      ctx: GraphQLContext,
    ) => {
      requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        ChatService.pipe(
          Effect.flatMap((s) => s.history(args.bookingId as BookingId)),
        ),
      );
    },
  },

  Mutation: {
    sendMessage: async (
      _p: unknown,
      args: { bookingId: string; text: string },
      ctx: GraphQLContext,
    ): Promise<ChatMessage> => {
      const viewer = requireViewer(ctx);
      const message = await runResolver(
        ctx.runtime,
        ChatService.pipe(
          Effect.flatMap((s) =>
            s.send(args.bookingId as BookingId, viewer.id, args.text),
          ),
        ),
      );
      // Fan the (already-masked) message out to live thread subscribers.
      pubSub.publish(chatTopic(args.bookingId), message);
      return message;
    },

    shareLocation: (
      _p: unknown,
      args: { bookingId: string; lat: number; lng: number },
      ctx: GraphQLContext,
    ) => {
      const viewer = requireViewer(ctx);
      return runResolver(
        ctx.runtime,
        ChatService.pipe(
          Effect.flatMap((s) =>
            s.shareLocation(
              args.bookingId as BookingId,
              viewer.id,
              args.lat,
              args.lng,
            ),
          ),
        ),
      );
    },
  },

  Subscription: {
    messageReceived: {
      subscribe: (_p: unknown, args: { bookingId: string }) =>
        pubSub.subscribe(chatTopic(args.bookingId)),
      resolve: (payload: ChatMessage): ChatMessage => payload,
    },
  },
};

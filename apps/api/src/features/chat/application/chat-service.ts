import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import type { BookingId, UserId } from "@gymkartel/contracts";
import { Clock } from "../../../shared/time/clock.js";
import { newId } from "../../../shared/ids/ids.js";
import type { DatabaseError } from "../../../shared/errors/errors.js";
import { BookingRepo } from "../../bookings/application/booking-repo.js";
import { maskPii } from "../domain/mask.js";

export class ChatLocked extends Data.TaggedError("ChatLocked")<{
  readonly bookingId: string;
}> {}

export class LocationShareLocked extends Data.TaggedError("LocationShareLocked")<{
  readonly bookingId: string;
}> {}

export interface ChatMessage {
  readonly id: string;
  readonly bookingId: BookingId;
  readonly from: UserId;
  readonly text: string;
  readonly masked: boolean;
  readonly sentAt: string;
}

export interface ChatRepoApi {
  readonly append: (message: ChatMessage) => Effect.Effect<ChatMessage, DatabaseError>;
  readonly history: (
    bookingId: BookingId,
  ) => Effect.Effect<ChatMessage[], DatabaseError>;
}

export class ChatRepo extends Context.Tag("features/chat/ChatRepo")<
  ChatRepo,
  ChatRepoApi
>() {}

export interface ChatServiceApi {
  readonly send: (
    bookingId: BookingId,
    from: UserId,
    text: string,
  ) => Effect.Effect<ChatMessage, ChatLocked | DatabaseError>;
  readonly history: (
    bookingId: BookingId,
  ) => Effect.Effect<ChatMessage[], DatabaseError>;
  readonly shareLocation: (
    bookingId: BookingId,
    from: UserId,
    lat: number,
    lng: number,
  ) => Effect.Effect<{ expiresAt: string }, ChatLocked | LocationShareLocked | DatabaseError>;
}

export class ChatService extends Context.Tag("features/chat/ChatService")<
  ChatService,
  ChatServiceApi
>() {}

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const bookings = yield* BookingRepo;
    const chat = yield* ChatRepo;
    const clock = yield* Clock;

    const requireUnlocked = (bookingId: BookingId, now: Date) =>
      Effect.gen(function* () {
        const booking = yield* bookings.getById(bookingId);
        if (!booking || booking.chatUnlockedAt == null) {
          return yield* Effect.fail(new ChatLocked({ bookingId }));
        }
        return booking;
      });

    return {
      send: (bookingId, from, text) =>
        Effect.gen(function* () {
          const now = yield* clock.now;
          yield* requireUnlocked(bookingId, now);
          const { text: safe, masked } = maskPii(text);
          return yield* chat.append({
            id: newId<string>("msg"),
            bookingId,
            from,
            text: safe,
            masked,
            sentAt: now.toISOString(),
          });
        }),

      history: (bookingId) => chat.history(bookingId),

      shareLocation: (bookingId, _from, _lat, _lng) =>
        Effect.gen(function* () {
          const now = yield* clock.now;
          const booking = yield* requireUnlocked(bookingId, now);
          const sessionEnd = new Date(
            new Date(booking.scheduledFor).getTime() + 90 * 60 * 1000,
          );
          if (now.getTime() > sessionEnd.getTime()) {
            return yield* Effect.fail(new LocationShareLocked({ bookingId }));
          }
          return { expiresAt: sessionEnd.toISOString() };
        }),
    };
  }),
);

export const ChatRepoMemory: Layer.Layer<ChatRepo> = Layer.sync(ChatRepo, () => {
  const rows: ChatMessage[] = [];
  return {
    append: (message) =>
      Effect.sync(() => {
        rows.push(message);
        return message;
      }),
    history: (bookingId) =>
      Effect.sync(() => rows.filter((m) => m.bookingId === bookingId)),
  };
});

import { Effect, Layer } from "effect";
import { z } from "zod";
import { BookingId, UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import { ChatRepo, type ChatMessage } from "../application/chat-service.js";

const COLLECTION = "chatMessages";

const ChatMessageDoc = z.object({
  id: z.string().min(1),
  bookingId: BookingId,
  from: UserId,
  text: z.string(),
  masked: z.boolean(),
  sentAt: z.string().min(1),
});

const parseMessage = (doc: unknown): Effect.Effect<ChatMessage, DatabaseError> => {
  const r = ChatMessageDoc.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "chatMessages.parse", cause: r.error }));
};

export const ChatRepoMongo: Layer.Layer<ChatRepo, never, Mongo> = Layer.effect(
  ChatRepo,
  Effect.gen(function* () {
    const mongo = yield* Mongo;
    const col = mongo.collection<ChatMessage>(COLLECTION);
    return {
      append: (message) =>
        parseMessage(message).pipe(
          Effect.flatMap((valid) =>
            mongoOp("chatMessages.append", () => col.insertOne(valid)).pipe(
              Effect.as(valid),
            ),
          ),
        ),
      history: (bookingId) =>
        mongoOp("chatMessages.history", () =>
          col.find({ bookingId }).sort({ sentAt: 1 }).toArray(),
        ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseMessage))),
    };
  }),
);

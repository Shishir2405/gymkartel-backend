import { Effect, Layer } from "effect";
import { z } from "zod";
import { UserId } from "@gymkartel/contracts";
import { Mongo, mongoOp } from "../../../shared/db/mongo.js";
import { DatabaseError } from "../../../shared/errors/errors.js";
import {
  NotificationInbox,
  type InboxNotification,
} from "../application/inbox.js";

/**
 * Mongo-backed in-app notification inbox (`notifications` collection) plus a
 * `pushTokens` collection for Expo token registration. Documents are
 * feature-internal, validated with a local Zod schema. The feed read uses the
 * `user_createdAt` index in `shared/db/indexes.ts`.
 */
const COLLECTION = "notifications";
const TOKENS_COLLECTION = "pushTokens";

const InboxDoc = z.object({
  id: z.string().min(1),
  userId: UserId,
  kind: z.enum(["GENERAL", "BOOKING", "STREAK", "SAFETY", "PASS"]),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string().min(1),
});

interface PushTokenDoc {
  readonly userId: string;
  readonly token: string;
}

const parseInbox = (doc: unknown): Effect.Effect<InboxNotification, DatabaseError> => {
  const r = InboxDoc.safeParse(doc);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new DatabaseError({ op: "notifications.parse", cause: r.error }));
};

export const NotificationInboxMongo: Layer.Layer<NotificationInbox, never, Mongo> =
  Layer.effect(
    NotificationInbox,
    Effect.gen(function* () {
      const mongo = yield* Mongo;
      const col = mongo.collection<InboxNotification>(COLLECTION);
      const tokens = mongo.collection<PushTokenDoc>(TOKENS_COLLECTION);
      return {
        list: (userId) =>
          mongoOp("notifications.list", () =>
            col.find({ userId }).sort({ createdAt: -1 }).toArray(),
          ).pipe(Effect.flatMap((docs) => Effect.forEach(docs, parseInbox))),
        markRead: (userId, id) =>
          mongoOp("notifications.markRead", () =>
            col.updateOne({ id, userId }, { $set: { read: true } }),
          ).pipe(Effect.map((res) => res.matchedCount > 0)),
        registerPushToken: (userId, token) =>
          mongoOp("notifications.registerPushToken", () =>
            tokens.updateOne(
              { userId, token },
              { $setOnInsert: { userId, token } },
              { upsert: true },
            ),
          ).pipe(Effect.asVoid),
      };
    }),
  );

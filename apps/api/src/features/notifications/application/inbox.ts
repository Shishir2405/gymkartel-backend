import { Context, Effect, Layer } from "effect";
import type { UserId } from "@gymkartel/contracts";
import type { DatabaseError } from "../../../shared/errors/errors.js";

export type NotificationKind = "GENERAL" | "BOOKING" | "STREAK" | "SAFETY" | "PASS";

export interface InboxNotification {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface NotificationInboxApi {
  readonly list: (userId: UserId) => Effect.Effect<InboxNotification[], DatabaseError>;
  readonly markRead: (
    userId: UserId,
    id: string,
  ) => Effect.Effect<boolean, DatabaseError>;
  readonly registerPushToken: (
    userId: UserId,
    token: string,
  ) => Effect.Effect<void, DatabaseError>;
}

export class NotificationInbox extends Context.Tag(
  "features/notifications/NotificationInbox",
)<NotificationInbox, NotificationInboxApi>() {}

export interface SeedNotification {
  readonly userId: UserId;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
}

export const NotificationInboxMemory = (
  seed: readonly SeedNotification[] = [],
): Layer.Layer<NotificationInbox> =>
  Layer.sync(NotificationInbox, () => {
    const rows: InboxNotification[] = seed.map((s, i) => ({
      id: `ntf_seed_${i}`,
      userId: s.userId,
      kind: s.kind,
      title: s.title,
      body: s.body,
      read: false,
      createdAt: s.createdAt,
    }));
    const tokens = new Map<UserId, Set<string>>();
    return {
      list: (userId) =>
        Effect.sync(() =>
          rows
            .filter((r) => r.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        ),
      markRead: (userId, id) =>
        Effect.sync(() => {
          const idx = rows.findIndex((r) => r.id === id && r.userId === userId);
          if (idx < 0) return false;
          rows[idx] = { ...rows[idx]!, read: true };
          return true;
        }),
      registerPushToken: (userId, token) =>
        Effect.sync(() => {
          const set = tokens.get(userId) ?? new Set<string>();
          set.add(token);
          tokens.set(userId, set);
        }),
    };
  });

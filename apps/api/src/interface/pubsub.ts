import { createPubSub } from "graphql-yoga";
import type { ChatMessage } from "../features/chat/application/chat-service.js";

/**
 * Process-wide pubsub for GraphQL subscriptions. graphql-yoga serves these over
 * SSE out of the box (no extra WS server needed for the local runtime); a
 * graphql-ws WebSocket transport can be layered on in server.ts for production.
 * The mutation side publishes, the Subscription resolver subscribes — sharing
 * this single instance is what makes them talk.
 */
export const pubSub = createPubSub<{
  /** Topic is namespaced per booking thread: `chat:<bookingId>`. */
  [topic: `chat:${string}`]: [ChatMessage];
}>();

export const chatTopic = (bookingId: string): `chat:${string}` =>
  `chat:${bookingId}`;

import { createPubSub } from "graphql-yoga";
import type { ChatMessage } from "../features/chat/application/chat-service.js";

export const pubSub = createPubSub<{
  [topic: `chat:${string}`]: [ChatMessage];
}>();

export const chatTopic = (bookingId: string): `chat:${string}` =>
  `chat:${bookingId}`;

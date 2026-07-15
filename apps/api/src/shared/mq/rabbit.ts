import { Context, Effect, Layer } from "effect";
import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { Config } from "../config/config.js";
import { MessageQueueError } from "../errors/errors.js";

/**
 * RabbitMQ topology (amqplib) wrapped as an Effect layer.
 *
 * Every logical queue gets a matching dead-letter exchange (DLX) and a retry
 * queue with a per-message TTL so a failed consumer nacks → message lands on
 * the retry queue → after the backoff delay it is re-published to the primary
 * queue. After N attempts it is parked on the `<queue>.dead` queue for a human.
 */
export const EXCHANGE = "gymkartel.events";
export const DLX = "gymkartel.dlx";
export const RETRY_EXCHANGE = "gymkartel.retry";

export const ROUTING = {
  checkinRecorded: "checkin.recorded",
  notificationDispatch: "notification.dispatch",
  payoutBatch: "payout.batch",
  shareCardRender: "sharecard.render",
  incidentEscalation: "incident.escalation",
} as const;

export type RoutingKey = (typeof ROUTING)[keyof typeof ROUTING];

export interface RabbitApi {
  readonly channel: Channel;
  readonly publish: (
    routingKey: RoutingKey,
    body: unknown,
  ) => Effect.Effect<void, MessageQueueError>;
}

export class Rabbit extends Context.Tag("shared/Rabbit")<Rabbit, RabbitApi>() {}

/** Assert the primary + retry + dead topology for one routing key / queue. */
export const assertQueueTopology = async (
  ch: Channel,
  queue: string,
  routingKey: string,
  retryDelayMs = 5000,
): Promise<void> => {
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  await ch.assertExchange(DLX, "topic", { durable: true });
  await ch.assertExchange(RETRY_EXCHANGE, "topic", { durable: true });

  // Primary queue: failures are dead-lettered to the retry exchange.
  await ch.assertQueue(queue, {
    durable: true,
    deadLetterExchange: RETRY_EXCHANGE,
    deadLetterRoutingKey: routingKey,
  });
  await ch.bindQueue(queue, EXCHANGE, routingKey);

  // Retry queue: holds messages for `retryDelayMs`, then dead-letters back to
  // the primary exchange for another attempt.
  const retryQueue = `${queue}.retry`;
  await ch.assertQueue(retryQueue, {
    durable: true,
    deadLetterExchange: EXCHANGE,
    deadLetterRoutingKey: routingKey,
    messageTtl: retryDelayMs,
  });
  await ch.bindQueue(retryQueue, RETRY_EXCHANGE, routingKey);

  // Dead queue: terminal parking for messages that exhausted retries.
  const deadQueue = `${queue}.dead`;
  await ch.assertQueue(deadQueue, { durable: true });
  await ch.bindQueue(deadQueue, DLX, routingKey);
};

export const RabbitLive = Layer.scoped(
  Rabbit,
  Effect.gen(function* () {
    const config = yield* Config;
    const conn = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => amqp.connect(config.rabbitmqUrl) as Promise<ChannelModel>,
        catch: (cause) => new MessageQueueError({ op: "connect", cause }),
      }),
      (c) => Effect.promise(() => c.close()),
    );
    const channel = yield* Effect.tryPromise({
      try: () => conn.createChannel(),
      catch: (cause) => new MessageQueueError({ op: "createChannel", cause }),
    });
    yield* Effect.tryPromise({
      try: () => channel.assertExchange(EXCHANGE, "topic", { durable: true }),
      catch: (cause) => new MessageQueueError({ op: "assertExchange", cause }),
    });
    return {
      channel,
      publish: (routingKey, body) =>
        Effect.try({
          try: () => {
            const ok = channel.publish(
              EXCHANGE,
              routingKey,
              Buffer.from(JSON.stringify(body)),
              { persistent: true, contentType: "application/json" },
            );
            if (!ok) throw new Error("publish buffer full");
          },
          catch: (cause) => new MessageQueueError({ op: `publish:${routingKey}`, cause }),
        }),
    };
  }),
);

/** Attempt count read from x-death headers (retry-with-backoff bookkeeping). */
export const attemptCount = (msg: ConsumeMessage): number => {
  const xDeath = msg.properties.headers?.["x-death"];
  if (!Array.isArray(xDeath) || xDeath.length === 0) return 0;
  const first = xDeath[0] as { count?: number } | undefined;
  return typeof first?.count === "number" ? first.count : 0;
};

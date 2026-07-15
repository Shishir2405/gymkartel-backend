import { createServer } from "node:http";
import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import { pino } from "pino";
import { Effect } from "effect";
import {
  ROUTING,
  DLX,
  assertQueueTopology,
  attemptCount,
  type RoutingKey,
} from "@gymkartel/api/workers";
import { retryDecision, backoffMs } from "./retry.js";
import {
  QUEUE,
  streakRecompute,
  rankRecompute,
  shareCardRender,
  notificationDispatch,
  payoutBatch,
  incidentEscalation,
  type HandlerDeps,
} from "./handlers.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/**
 * The @gymkartel/workers app. Hosts every RabbitMQ consumer (streak/rank
 * recompute, share-card render, notification dispatch, payout batch, incident
 * escalation). Each consumer runs its handler as an Effect and applies the
 * shared DLX + retry-with-backoff policy: transient failures nack → delayed
 * retry queue → primary; after MAX_ATTEMPTS the message is parked on the dead
 * queue for a human.
 */
type Handler = (raw: unknown) => Effect.Effect<void, unknown>;

const deps: HandlerDeps = {
  log: (msg, meta) => log.info(meta ?? {}, msg),
  // Production wires this to the Mongo check-in repo; standalone it is empty.
  loadCheckInInstants: async () => [],
  now: () => new Date(),
};

const registerConsumer = async (
  ch: Channel,
  routingKey: RoutingKey,
  handler: Handler,
): Promise<void> => {
  const queue = QUEUE[routingKey] ?? routingKey;
  await assertQueueTopology(ch, queue, routingKey, backoffMs(0));
  await ch.consume(queue, (msg: ConsumeMessage | null) => {
    if (!msg) return;
    const attempts = attemptCount(msg);
    void Effect.runPromise(
      handler(safeJson(msg.content.toString("utf8"))) as Effect.Effect<void, unknown>,
    )
      .then(() => ch.ack(msg))
      .catch((err: unknown) => {
        if (retryDecision(attempts) === "PARK") {
          // Exhausted retries → park on the dead queue, then ack the original.
          ch.publish(DLX, routingKey, msg.content, { persistent: true });
          ch.ack(msg);
          log.error({ routingKey, attempts, err: String(err) }, "message parked (dead)");
        } else {
          // Dead-letter to the retry exchange → delayed re-delivery.
          ch.nack(msg, false, false);
          log.warn({ routingKey, attempts, err: String(err) }, "message retrying");
        }
      });
  });
  log.info({ queue, routingKey }, "consumer registered");
};

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const startHealthServer = (): void => {
  const port = Number(process.env.WORKERS_HEALTH_PORT ?? 4100);
  createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  }).listen(port, () => log.info({ port }, "workers health endpoint up"));
};

const main = async (): Promise<void> => {
  startHealthServer();
  const conn = await amqp.connect(process.env.RABBITMQ_URL ?? "amqp://localhost:5672");
  const ch = await conn.createChannel();
  await ch.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 10));

  await registerConsumer(ch, ROUTING.checkinRecorded, streakRecompute(deps));
  // Rank recompute shares the checkin.recorded stream on its own queue binding.
  await registerConsumer(ch, ROUTING.shareCardRender, shareCardRender(deps));
  await registerConsumer(ch, ROUTING.notificationDispatch, notificationDispatch(deps));
  await registerConsumer(ch, ROUTING.payoutBatch, payoutBatch(deps));
  await registerConsumer(ch, ROUTING.incidentEscalation, incidentEscalation(deps));
  // rankRecompute is available for a dedicated binding in production topology.
  void rankRecompute;

  const shutdown = async (): Promise<void> => {
    await ch.close();
    await conn.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
};

void main();

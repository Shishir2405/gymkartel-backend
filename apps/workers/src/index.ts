import { createServer } from "node:http";
import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import { pino } from "pino";
import { Effect } from "effect";
import {
  ROUTING,
  DLX,
  assertQueueTopology,
  attemptCount,
  buildShareCardData,
  makeR2ShareCardUploader,
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
  type ShareCardDeps,
} from "./handlers.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

type Handler = (raw: unknown) => Effect.Effect<void, unknown>;

const deps: HandlerDeps = {
  log: (msg, meta) => log.info(meta ?? {}, msg),
  loadCheckInInstants: async () => [],
  now: () => new Date(),
};

const shareCardDeps: ShareCardDeps = {
  log: deps.log,
  loadCardData: async (evt) =>
    buildShareCardData({
      gymName: evt.gymId,
      checkInInstants: await deps.loadCheckInInstants(evt.userId),
      now: deps.now(),
    }),
  upload: makeR2ShareCardUploader(),
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
          ch.publish(DLX, routingKey, msg.content, { persistent: true });
          ch.ack(msg);
          log.error({ routingKey, attempts, err: String(err) }, "message parked (dead)");
        } else {
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
  await registerConsumer(ch, ROUTING.shareCardRender, shareCardRender(shareCardDeps));
  await registerConsumer(ch, ROUTING.notificationDispatch, notificationDispatch(deps));
  await registerConsumer(ch, ROUTING.payoutBatch, payoutBatch(deps));
  await registerConsumer(ch, ROUTING.incidentEscalation, incidentEscalation(deps));
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

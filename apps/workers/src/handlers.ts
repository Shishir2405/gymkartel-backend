import { Effect } from "effect";
import { z } from "zod";
import {
  computeStreak,
  rankForWeeks,
  renderShareCard,
  ROUTING,
  type RoutingKey,
  type ShareCardData,
  type ShareCardUploader,
} from "@gymkartel/api/workers";

const CheckinRecorded = z.object({
  checkInId: z.string(),
  userId: z.string(),
  gymId: z.string(),
  zone: z.string(),
  scannedAt: z.string(),
});

const NotificationDispatch = z.object({
  channel: z.enum(["SMS", "EMAIL", "WHATSAPP", "PUSH"]),
  template: z.string(),
  to: z.string(),
  params: z.record(z.union([z.string(), z.number()])),
});

export class BadMessage extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "BadMessage";
  }
}

const parse = <T>(schema: z.ZodType<T>, raw: unknown): Effect.Effect<T, BadMessage> => {
  const r = schema.safeParse(raw);
  return r.success
    ? Effect.succeed(r.data)
    : Effect.fail(new BadMessage(r.error.issues[0]?.message ?? "invalid message"));
};

export interface HandlerDeps {
  readonly log: (msg: string, meta?: Record<string, unknown>) => void;
  readonly loadCheckInInstants: (userId: string) => Promise<Date[]>;
  readonly now: () => Date;
}

export interface ShareCardDeps {
  readonly log: (msg: string, meta?: Record<string, unknown>) => void;
  readonly loadCardData: (evt: CheckinRecordedEvent) => Promise<ShareCardData>;
  readonly upload: ShareCardUploader;
}

type CheckinRecordedEvent = z.infer<typeof CheckinRecorded>;

export class RenderFailed extends Error {
  constructor(readonly detail: unknown) {
    super("share-card render/upload failed");
    this.name = "RenderFailed";
  }
}

export const streakRecompute = (deps: HandlerDeps) => (raw: unknown) =>
  Effect.gen(function* () {
    const evt = yield* parse(CheckinRecorded, raw);
    const instants = yield* Effect.promise(() => deps.loadCheckInInstants(evt.userId));
    const state = computeStreak(instants, deps.now());
    deps.log("streak recomputed", {
      userId: evt.userId,
      weeks: state.weeks,
      bonusDaysEarned: state.bonusDaysEarned,
    });
  });

export const rankRecompute = (deps: HandlerDeps) => (raw: unknown) =>
  Effect.gen(function* () {
    const evt = yield* parse(CheckinRecorded, raw);
    const instants = yield* Effect.promise(() => deps.loadCheckInInstants(evt.userId));
    const state = computeStreak(instants, deps.now());
    const rank = rankForWeeks(state.weeks);
    deps.log("rank recomputed", { userId: evt.userId, rank: rank.current });
  });

export const shareCardRender = (deps: ShareCardDeps) => (raw: unknown) =>
  Effect.gen(function* () {
    const evt = yield* parse(CheckinRecorded, raw);
    const url = yield* Effect.tryPromise({
      try: async () => {
        const data = await deps.loadCardData(evt);
        const png = await renderShareCard(data);
        return deps.upload(evt.checkInId, png);
      },
      catch: (cause) => new RenderFailed(cause),
    });
    deps.log("share-card rendered", { checkInId: evt.checkInId, url });
  });

export const notificationDispatch = (deps: HandlerDeps) => (raw: unknown) =>
  Effect.gen(function* () {
    const msg = yield* parse(NotificationDispatch, raw);
    deps.log("notification dispatched", { channel: msg.channel, template: msg.template });
  });

export const payoutBatch = (deps: HandlerDeps) => (raw: unknown) =>
  Effect.gen(function* () {
    deps.log("coach payout batch processed", { raw: typeof raw });
  });

export const incidentEscalation = (deps: HandlerDeps) => (raw: unknown) =>
  Effect.gen(function* () {
    deps.log("incident escalated", { raw: typeof raw });
  });

export const QUEUE: Record<RoutingKey, string> = {
  [ROUTING.checkinRecorded]: "streak-rank-recompute",
  [ROUTING.notificationDispatch]: "notification-dispatch",
  [ROUTING.shareCardRender]: "sharecard-render",
  [ROUTING.payoutBatch]: "payout-batch",
  [ROUTING.incidentEscalation]: "incident-escalation",
};

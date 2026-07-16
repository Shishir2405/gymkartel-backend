import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Layer } from "effect";
import { pino, type Logger as PinoLogger } from "pino";
import type { AppConfig } from "../config/config.js";
import { Config } from "../config/config.js";

const REDACT_PATHS = [
  "phone",
  "*.phone",
  "*.*.phone",
  "trustedContact.phone",
  "upi",
  "*.upi",
  "vpa",
  "*.vpa",
  "authorization",
  "req.headers.authorization",
  "headers.authorization",
  "razorpaySignature",
  "*.razorpaySignature",
  "otp",
  "*.otp",
  "accessToken",
  "refreshToken",
  "*.accessToken",
  "*.refreshToken",
];

interface RequestContext {
  readonly requestId: string;
  readonly viewerId?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(ctx: RequestContext, fn: () => T): T =>
  als.run(ctx, fn);

export const currentRequestId = (): string | undefined => als.getStore()?.requestId;

export const createPinoLogger = (config: Pick<AppConfig, "logLevel" | "nodeEnv">): PinoLogger =>
  pino({
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...(config.nodeEnv === "development"
      ? { transport: { target: "pino/file", options: { destination: 1 } } }
      : {}),
    mixin: () => {
      const store = als.getStore();
      return store ? { requestId: store.requestId, viewerId: store.viewerId } : {};
    },
  });

export interface LoggerService {
  readonly info: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>;
  readonly warn: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>;
  readonly error: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>;
  readonly debug: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>;
  readonly raw: PinoLogger;
}

export class Logger extends Context.Tag("shared/Logger")<Logger, LoggerService>() {}

const wrap = (p: PinoLogger): LoggerService => ({
  info: (msg, meta) => Effect.sync(() => p.info(meta ?? {}, msg)),
  warn: (msg, meta) => Effect.sync(() => p.warn(meta ?? {}, msg)),
  error: (msg, meta) => Effect.sync(() => p.error(meta ?? {}, msg)),
  debug: (msg, meta) => Effect.sync(() => p.debug(meta ?? {}, msg)),
  raw: p,
});

export const LoggerLive = Layer.effect(
  Logger,
  Effect.gen(function* () {
    const config = yield* Config;
    return wrap(createPinoLogger(config));
  }),
);

export const LoggerTest = Layer.succeed(
  Logger,
  wrap(pino({ level: "silent" })),
);

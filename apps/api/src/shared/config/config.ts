import { Context, Effect, Layer } from "effect";
import { z } from "zod";

/**
 * Typed application configuration. Parsed once from `process.env` at the
 * composition root via Zod (trust boundary). Tests provide `ConfigTest`.
 */
export const AppConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  apiPort: z.coerce.number().int().positive().default(4000),
  workersHealthPort: z.coerce.number().int().positive().default(4100),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  /**
   * Selects the infrastructure stack wired at the composition root:
   *   - "memory" (default): infra-free in-memory adapters. Used by every test
   *     and by `pnpm dev` so the API boots without Docker.
   *   - "mongo": the driver-backed stack (MongoDB repos + Redis + RabbitMQ +
   *     live Razorpay gateway). Requires `docker compose up -d`.
   */
  persistence: z.enum(["memory", "mongo"]).default("memory"),

  jwtAccessSecret: z.string().min(1),
  jwtRefreshSecret: z.string().min(1),
  jwtAccessTtlSeconds: z.coerce.number().int().positive().default(900),
  jwtRefreshTtlSeconds: z.coerce.number().int().positive().default(2_592_000),
  otpTtlSeconds: z.coerce.number().int().positive().default(300),
  otpMaxAttempts: z.coerce.number().int().positive().default(5),

  mongoUri: z.string().min(1),
  mongoDb: z.string().min(1).default("gymkartel"),
  redisUrl: z.string().min(1),
  rabbitmqUrl: z.string().min(1),
  rabbitmqPrefetch: z.coerce.number().int().positive().default(10),

  razorpayKeyId: z.string().min(1),
  razorpayKeySecret: z.string().min(1),
  razorpayWebhookSecret: z.string().min(1),

  brevoApiKey: z.string().default(""),
  brevoSmsSender: z.string().default("GymKrtl"),
  expoAccessToken: z.string().optional(),

  r2AccountId: z.string().default(""),
  r2AccessKeyId: z.string().default(""),
  r2SecretAccessKey: z.string().default(""),
  r2Bucket: z.string().default("gymkartel-assets"),
  /** Dedicated bucket for worker-rendered check-in share cards. */
  r2ShareCardBucket: z.string().default("gymkartel-share-cards"),
  r2PublicBaseUrl: z.string().default("https://assets.gymkartel.example"),
  /**
   * Optional S3 endpoint override. Empty in production (the R2 adapter derives
   * the Cloudflare endpoint from the account id); set to the local MinIO URL
   * (http://localhost:9000) from docker-compose for local object storage.
   */
  s3Endpoint: z.string().default(""),
  s3ForcePathStyle: z.coerce.boolean().default(false),

  sentryDsn: z.string().optional(),
  otelEndpoint: z.string().optional(),
  otelServiceName: z.string().default("gymkartel-api"),

  appLatestVersion: z.string().default("1.0.0"),
  appMinSupportedVersion: z.string().default("1.0.0"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export class Config extends Context.Tag("shared/Config")<Config, AppConfig>() {}

/** Parse + validate an env bag into typed config (the Zod trust boundary). */
export const configFromEnv = (env: NodeJS.ProcessEnv): AppConfig =>
  AppConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    apiPort: env.API_PORT,
    workersHealthPort: env.WORKERS_HEALTH_PORT,
    logLevel: env.LOG_LEVEL,
    persistence: env.PERSISTENCE,
    jwtAccessSecret: env.JWT_ACCESS_SECRET ?? "dev-access-secret",
    jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
    jwtAccessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    jwtRefreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    otpTtlSeconds: env.OTP_TTL_SECONDS,
    otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
    mongoUri: env.MONGO_URI ?? "mongodb://localhost:27017",
    mongoDb: env.MONGO_DB,
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    rabbitmqUrl: env.RABBITMQ_URL ?? "amqp://localhost:5672",
    rabbitmqPrefetch: env.RABBITMQ_PREFETCH,
    razorpayKeyId: env.RAZORPAY_KEY_ID ?? "rzp_test_dev",
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET ?? "dev-razorpay-secret",
    razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? "dev-webhook-secret",
    brevoApiKey: env.BREVO_API_KEY,
    brevoSmsSender: env.BREVO_SMS_SENDER,
    expoAccessToken: env.EXPO_ACCESS_TOKEN,
    r2AccountId: env.R2_ACCOUNT_ID,
    r2AccessKeyId: env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
    r2Bucket: env.R2_BUCKET,
    r2ShareCardBucket: env.R2_SHARE_CARD_BUCKET,
    r2PublicBaseUrl: env.R2_PUBLIC_BASE_URL,
    s3Endpoint: env.S3_ENDPOINT,
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE,
    sentryDsn: env.SENTRY_DSN,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelServiceName: env.OTEL_SERVICE_NAME,
    appLatestVersion: env.APP_LATEST_VERSION,
    appMinSupportedVersion: env.APP_MIN_SUPPORTED_VERSION,
  });

/** Reads and validates process.env. Fails fast if required secrets are absent. */
export const ConfigLive = Layer.effect(
  Config,
  Effect.sync(() => configFromEnv(process.env)),
);

/** Deterministic config for tests. Override fields as needed. */
export const configTest = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  ...AppConfigSchema.parse({
    jwtAccessSecret: "test-access",
    jwtRefreshSecret: "test-refresh",
    mongoUri: "mongodb://localhost:27017",
    redisUrl: "redis://localhost:6379",
    rabbitmqUrl: "amqp://localhost:5672",
    razorpayKeyId: "rzp_test",
    razorpayKeySecret: "test-secret",
    razorpayWebhookSecret: "test-webhook",
  }),
  ...overrides,
});

export const ConfigTest = (overrides: Partial<AppConfig> = {}): Layer.Layer<Config> =>
  Layer.succeed(Config, configTest(overrides));

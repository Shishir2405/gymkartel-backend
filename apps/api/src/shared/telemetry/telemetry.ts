import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { AppConfig } from "../config/config.js";

/**
 * Observability bootstrap hooks. These run once at process start (before the
 * Effect runtime is built) — intentionally imperative, not an Effect layer.
 * No-ops cleanly when DSN/endpoint are unset so local dev needs no collector.
 */
let sdk: NodeSDK | null = null;

export const initTelemetry = (config: AppConfig): void => {
  if (config.sentryDsn) {
    Sentry.init({
      dsn: config.sentryDsn,
      environment: config.nodeEnv,
      tracesSampleRate: config.nodeEnv === "production" ? 0.2 : 1.0,
    });
  }

  if (config.otelEndpoint) {
    sdk = new NodeSDK({
      serviceName: config.otelServiceName,
      traceExporter: new OTLPTraceExporter({ url: config.otelEndpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
  }
};

export const shutdownTelemetry = async (): Promise<void> => {
  if (sdk) await sdk.shutdown();
  await Sentry.close(2000);
};

export const captureException = (err: unknown): void => {
  Sentry.captureException(err);
};

import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { AppConfig } from "../config/config.js";

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

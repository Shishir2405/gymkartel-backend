import { Effect } from "effect";
import { createApiServer } from "./interface/server.js";
import { appRuntime } from "./runtime/runtime.js";
import { Config } from "./shared/config/config.js";
import { Logger } from "./shared/logger/logger.js";
import { initTelemetry, shutdownTelemetry } from "./shared/telemetry/telemetry.js";

const main = async (): Promise<void> => {
  const config = await appRuntime.runPromise(Config);
  initTelemetry(config);

  const server = createApiServer();
  server.listen(config.apiPort, () => {
    void appRuntime.runPromise(
      Logger.pipe(
        Effect.flatMap((l) =>
          l.info("gymkartel-api listening", { port: config.apiPort }),
        ),
      ),
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    server.close();
    await appRuntime.dispose();
    await shutdownTelemetry();
    process.stdout.write(`\n${signal} received — shut down cleanly\n`);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

void main();

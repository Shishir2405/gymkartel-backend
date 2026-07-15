import { Context, Effect, Layer } from "effect";
import { Config } from "../../../shared/config/config.js";

export interface VersionGate {
  readonly latestVersion: string;
  readonly minSupportedVersion: string;
}

export interface VersionGateServiceApi {
  readonly get: Effect.Effect<VersionGate>;
}

export class VersionGateService extends Context.Tag(
  "features/version-gate/VersionGateService",
)<VersionGateService, VersionGateServiceApi>() {}

export const VersionGateServiceLive = Layer.effect(
  VersionGateService,
  Effect.gen(function* () {
    const config = yield* Config;
    return {
      get: Effect.succeed({
        latestVersion: config.appLatestVersion,
        minSupportedVersion: config.appMinSupportedVersion,
      }),
    };
  }),
);

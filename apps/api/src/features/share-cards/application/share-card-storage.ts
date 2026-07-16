import { Effect, Layer, ManagedRuntime } from "effect";
import { Config, configFromEnv } from "../../../shared/config/config.js";
import { ObjectStorage, ObjectStorageR2 } from "../../../shared/storage/r2.js";

export const shareCardKey = (checkInId: string): string => `share-cards/${checkInId}.png`;

export type ShareCardUploader = (
  checkInId: string,
  png: Uint8Array,
) => Promise<string>;

export const makeR2ShareCardUploader = (
  env: NodeJS.ProcessEnv = process.env,
): ShareCardUploader => {
  const base = configFromEnv(env);
  const configLayer = Layer.succeed(Config, { ...base, r2Bucket: base.r2ShareCardBucket });
  const runtime = ManagedRuntime.make(Layer.provide(ObjectStorageR2, configLayer));

  return (checkInId, png) => {
    const key = shareCardKey(checkInId);
    return runtime.runPromise(
      Effect.gen(function* () {
        const storage = yield* ObjectStorage;
        yield* storage.putObject(key, png, "image/png");
        return yield* storage.signedDownload(key);
      }),
    );
  };
};

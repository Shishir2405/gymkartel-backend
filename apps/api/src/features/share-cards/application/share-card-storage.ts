import { Effect, Layer, ManagedRuntime } from "effect";
import { Config, configFromEnv } from "../../../shared/config/config.js";
import { ObjectStorage, ObjectStorageR2 } from "../../../shared/storage/r2.js";

/**
 * Storage side of the share-card pipeline. The render is pure (`domain/render`);
 * this module persists the PNG via the existing R2 storage adapter and hands
 * back a signed URL.
 *
 * Idempotent per check-in id: the object key is derived from the check-in id, so
 * a re-render OVERWRITES the same object instead of creating a duplicate.
 */
export const shareCardKey = (checkInId: string): string => `share-cards/${checkInId}.png`;

/** Uploads bytes we already hold, returning a time-limited signed GET URL. */
export type ShareCardUploader = (
  checkInId: string,
  png: Uint8Array,
) => Promise<string>;

/**
 * Build a plain-Promise uploader backed by `ObjectStorageR2`, targeting the
 * dedicated `gymkartel-share-cards` bucket. Returned as a Promise-function so
 * the workers app can inject it exactly like its other async deps, without
 * threading Effect layers through every consumer.
 *
 * Reads config from `process.env` at construction (composition root only) and
 * overrides the bucket to the share-card bucket.
 */
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

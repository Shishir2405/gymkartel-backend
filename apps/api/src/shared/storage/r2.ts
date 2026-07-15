import { Context, Effect, Layer } from "effect";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Config } from "../config/config.js";
import { ExternalServiceError } from "../errors/errors.js";

/**
 * S3-compatible (Cloudflare R2) object-storage adapter for share-card renders,
 * cert uploads and transformation photos. Only ever hands out SIGNED URLs — the
 * bucket is private; the app uploads via a presigned PUT and reads via a
 * presigned GET, both time-limited.
 */
export interface ObjectStorageApi {
  readonly signedUpload: (
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ) => Effect.Effect<string, ExternalServiceError>;
  readonly signedDownload: (
    key: string,
    expiresInSeconds?: number,
  ) => Effect.Effect<string, ExternalServiceError>;
  /**
   * Server-side upload of bytes we already hold (e.g. a worker-rendered share
   * card). Overwrites the same key, so callers keying by a stable id (check-in
   * id) get idempotent re-renders rather than duplicates.
   */
  readonly putObject: (
    key: string,
    body: Uint8Array,
    contentType: string,
  ) => Effect.Effect<void, ExternalServiceError>;
}

export class ObjectStorage extends Context.Tag("shared/ObjectStorage")<
  ObjectStorage,
  ObjectStorageApi
>() {}

export const ObjectStorageR2: Layer.Layer<ObjectStorage, never, Config> = Layer.effect(
  ObjectStorage,
  Effect.gen(function* () {
    const config = yield* Config;
    // Local MinIO (docker-compose) sets S3_ENDPOINT + path-style; production
    // leaves them empty and the Cloudflare R2 endpoint is derived instead.
    const endpoint =
      config.s3Endpoint !== ""
        ? config.s3Endpoint
        : `https://${config.r2AccountId}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });
    return {
      signedUpload: (key, contentType, expiresInSeconds = 600) =>
        Effect.tryPromise({
          try: () =>
            getSignedUrl(
              client,
              new PutObjectCommand({
                Bucket: config.r2Bucket,
                Key: key,
                ContentType: contentType,
              }),
              { expiresIn: expiresInSeconds },
            ),
          catch: (cause) => new ExternalServiceError({ service: "r2:put", cause }),
        }),
      signedDownload: (key, expiresInSeconds = 600) =>
        Effect.tryPromise({
          try: () =>
            getSignedUrl(
              client,
              new GetObjectCommand({ Bucket: config.r2Bucket, Key: key }),
              { expiresIn: expiresInSeconds },
            ),
          catch: (cause) => new ExternalServiceError({ service: "r2:get", cause }),
        }),
      putObject: (key, body, contentType) =>
        Effect.tryPromise({
          try: () =>
            client.send(
              new PutObjectCommand({
                Bucket: config.r2Bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
              }),
            ),
          catch: (cause) => new ExternalServiceError({ service: "r2:putObject", cause }),
        }).pipe(Effect.asVoid),
    };
  }),
);

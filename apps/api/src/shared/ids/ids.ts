import { randomUUID, createHash } from "node:crypto";

/**
 * ID generation. Branded contract IDs are just strings at runtime, so we cast
 * at this single choke point (the brand exists only in the type system).
 */
export const newId = <B extends string>(prefix: string): B =>
  `${prefix}_${randomUUID()}` as B;

/** Deterministic short hash — used for idempotency-key derived doc ids. */
export const shortHash = (input: string): string =>
  createHash("sha256").update(input).digest("hex").slice(0, 24);

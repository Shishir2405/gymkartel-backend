import { randomUUID, createHash } from "node:crypto";

export const newId = <B extends string>(prefix: string): B =>
  `${prefix}_${randomUUID()}` as B;

export const shortHash = (input: string): string =>
  createHash("sha256").update(input).digest("hex").slice(0, 24);

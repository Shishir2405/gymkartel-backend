import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createSchema } from "graphql-yoga";
import { resolvers } from "./resolvers.js";

/**
 * Load the SDL from @gymkartel/contracts (the wire contract — single source of
 * truth). We resolve the package's `./schema.graphql` export rather than
 * hardcoding a path so a contracts version bump is picked up automatically.
 */
const require = createRequire(import.meta.url);

export const loadTypeDefs = (): string => {
  const schemaPath = require.resolve("@gymkartel/contracts/schema.graphql");
  return readFileSync(schemaPath, "utf8");
};

export const buildSchema = () =>
  createSchema({
    typeDefs: loadTypeDefs(),
    resolvers,
  });

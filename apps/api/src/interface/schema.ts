import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createSchema } from "graphql-yoga";
import { resolvers } from "./resolvers.js";
import type { GraphQLContext } from "./context.js";

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
  // Bind the executable schema to the app's context type. The merged resolver
  // map is intentionally structurally-typed (see resolvers.ts), so we pin the
  // context here to keep Yoga's `context` factory and the schema in lock-step.
  createSchema<GraphQLContext>({
    typeDefs: loadTypeDefs(),
    resolvers,
  });

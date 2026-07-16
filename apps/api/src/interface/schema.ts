import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createSchema } from "graphql-yoga";
import { resolvers } from "./resolvers.js";
import type { GraphQLContext } from "./context.js";

const require = createRequire(import.meta.url);

export const loadTypeDefs = (): string => {
  const schemaPath = require.resolve("@gymkartel/contracts/schema.graphql");
  return readFileSync(schemaPath, "utf8");
};

export const buildSchema = () =>
  createSchema<GraphQLContext>({
    typeDefs: loadTypeDefs(),
    resolvers,
  });

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { createYoga } from "graphql-yoga";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { buildSchema } from "./schema.js";
import { resolveViewer, type GraphQLContext } from "./context.js";
import { handleRazorpayWebhook } from "./webhook.js";
import { appRuntime } from "../runtime/runtime.js";
import { runWithRequestContext } from "../shared/logger/logger.js";

const readRawBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

export const buildYoga = () =>
  createYoga({
    schema: buildSchema(),
    graphqlEndpoint: "/graphql",
    context: async ({ request }): Promise<GraphQLContext> => {
      const auth = request.headers.get("authorization") ?? undefined;
      const viewer = await resolveViewer(auth);
      const requestId: string = randomUUID();
      return { runtime: appRuntime, viewer, requestId };
    },
  });

const attachSubscriptions = (
  httpServer: Server,
  yoga: ReturnType<typeof buildYoga>,
): void => {
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: yoga.graphqlEndpoint,
  });

  useServer(
    {
      execute: (args: any) => args.rootValue.execute(args),
      subscribe: (args: any) => args.rootValue.subscribe(args),
      onSubscribe: async (ctx, msg) => {
        const { schema, execute, subscribe, contextFactory, parse, validate } =
          yoga.getEnveloped({
            ...ctx,
            req: ctx.extra.request,
            socket: ctx.extra.socket,
            params: msg.payload,
          });

        const args = {
          schema,
          operationName: msg.payload.operationName,
          document: parse(msg.payload.query),
          variableValues: msg.payload.variables,
          contextValue: await contextFactory(),
          rootValue: { execute, subscribe },
        };

        const errors = validate(args.schema, args.document);
        if (errors.length) return errors;
        return args;
      },
    },
    wsServer,
  );
};

export const createApiServer = () => {
  const yoga = buildYoga();

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestId = randomUUID();
    void runWithRequestContext({ requestId }, async () => {
      try {
        const url = req.url ?? "/";

        if (url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (url === "/ready") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ready" }));
          return;
        }
        if (url === "/webhooks/razorpay" && req.method === "POST") {
          const rawBody = await readRawBody(req);
          const signature =
            (req.headers["x-razorpay-signature"] as string | undefined) ?? "";
          const result = await handleRazorpayWebhook(appRuntime, rawBody, signature);
          res.writeHead(result.status, { "content-type": "application/json" });
          res.end(JSON.stringify(result.body));
          return;
        }

        void yoga(req, res);
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "internal", message: String(err) }));
      }
    });
  });

  attachSubscriptions(httpServer, yoga);
  return httpServer;
};

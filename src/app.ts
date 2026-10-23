import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppEnv } from "./config/env.js";
import type { Database } from "./db/pool.js";
import { DomainError } from "./domain/index.js";
import { registerAdminRoutes } from "./http/admin-routes.js";
import { registerAgentRoutes } from "./http/agent-routes.js";
import { registerBillingRoutes } from "./http/billing-routes.js";
import { registerIntegrationRoutes } from "./http/integration-routes.js";
import { registerPaymentRoutes } from "./http/payment-routes.js";

export type BuildAppOptions = {
  env: AppEnv;
  db: Database;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.env.nodeEnv === "test"
        ? false
        : {
            level: options.env.logLevel
          }
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      try {
        const rawBody = body.toString("utf8");
        request.rawBody = rawBody;
        done(null, rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (request, body, done) => {
      const rawBody = String(body);
      request.rawBody = rawBody;
      done(null, Object.fromEntries(new URLSearchParams(rawBody)));
    }
  );

  app.decorate("db", options.db);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Reusable Credits Platform API",
        description: "Reusable billing and credits platform module.",
        version: "0.1.0"
      },
      tags: [
        {
          name: "system",
          description: "System health and readiness endpoints."
        },
        {
          name: "billing",
          description: "Billing usage flow endpoints."
        },
        {
          name: "payments",
          description: "Recharge products, payment orders, and provider callbacks."
        },
        {
          name: "integration",
          description: "External AI application registration and pluggability contract."
        },
        {
          name: "admin",
          description: "Tenant/admin account, member, and transaction query endpoints."
        },
        {
          name: "agents",
          description: "Agent/downline relation and commission endpoints."
        }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      const statusCodeByCode: Record<string, number> = {
        bad_request: 400,
        forbidden: 403,
        not_found: 404,
        conflict: 409,
        insufficient_credits: 402
      };

      return reply.code(statusCodeByCode[error.code] ?? 400).send({
        error: error.code,
        message: error.message
      });
    }

    throw error;
  });

  await app.register(registerBillingRoutes, {
    db: options.db
  });

  await app.register(registerPaymentRoutes, {
    db: options.db,
    env: options.env
  });

  await app.register(registerIntegrationRoutes, {
    db: options.db
  });

  await app.register(registerAdminRoutes, {
    db: options.db
  });

  await app.register(registerAgentRoutes, {
    db: options.db
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["ok"] }
            }
          }
        }
      }
    },
    () => ({ status: "ok" as const })
  );

  app.get(
    "/openapi.json",
    {
      schema: {
        tags: ["system"],
        hide: true
      }
    },
    () => app.swagger()
  );

  app.get(
    "/health/db",
    {
      schema: {
        tags: ["system"],
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["ok"] }
            }
          },
          503: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["unavailable"] }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        await options.db.query("select 1");
        return { status: "ok" as const };
      } catch {
        return reply.code(503).send({ status: "unavailable" as const });
      }
    }
  );

  return app;
}

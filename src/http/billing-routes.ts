import type { FastifyInstance } from "fastify";
import { BillingService } from "../billing/billing-service.js";
import type { Database } from "../db/pool.js";
import { BadRequestError } from "../domain/index.js";
import { requestHash } from "./request-hash.js";

type RegisterBillingRoutesOptions = {
  db: Database;
};

type EstimateBody = {
  userId: number;
  accountScope: "personal" | "tenant";
  tenantId?: number;
  applicationCode: string;
  functionCode: string;
  estimatedPoints?: string;
  bizType: string;
  bizId: string;
  idempotencyKey: string;
};

type TaskMutationBody = {
  userId: number;
  billingTaskId: number;
  idempotencyKey: string;
};

type UserQuery = {
  userId?: string;
  limit?: string;
};

type IdParam = {
  id: string;
};

const idempotentReplay = { type: "boolean" };

const billingTaskResponseSchema = {
  type: "object",
  required: [
    "billingTaskId",
    "tenantId",
    "userId",
    "accountId",
    "applicationId",
    "functionId",
    "bizType",
    "bizId",
    "estimatedPoints",
    "frozenPoints",
    "settledPoints",
    "status",
    "idempotentReplay"
  ],
  properties: {
    billingTaskId: { type: "number" },
    tenantId: { type: ["number", "null"] },
    userId: { type: "number" },
    accountId: { type: "number" },
    applicationId: { type: "number" },
    functionId: { type: "number" },
    bizType: { type: "string" },
    bizId: { type: "string" },
    estimatedPoints: { type: "string" },
    frozenPoints: { type: "string" },
    settledPoints: { type: "string" },
    status: {
      type: "string",
      enum: ["estimated", "frozen", "settled", "refunded", "failed", "cancelled"]
    },
    idempotentReplay
  }
};

const taskMutationBodySchema = {
  type: "object",
  required: ["userId", "billingTaskId", "idempotencyKey"],
  additionalProperties: false,
  properties: {
    userId: { type: "number" },
    billingTaskId: { type: "number" },
    idempotencyKey: { type: "string", minLength: 1 }
  }
};

function parseRequiredNumber(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 50;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new BadRequestError("limit must be an integer between 1 and 100");
  }

  return parsed;
}

export function registerBillingRoutes(
  app: FastifyInstance,
  options: RegisterBillingRoutesOptions
): void {
  const billing = new BillingService(options.db);

  app.post<{ Body: EstimateBody }>(
    "/billing/estimate",
    {
      schema: {
        tags: ["billing"],
        body: {
          type: "object",
          required: [
            "userId",
            "accountScope",
            "applicationCode",
            "functionCode",
            "bizType",
            "bizId",
            "idempotencyKey"
          ],
          additionalProperties: false,
          properties: {
            userId: { type: "number" },
            accountScope: { type: "string", enum: ["personal", "tenant"] },
            tenantId: { type: "number" },
            applicationCode: { type: "string", minLength: 1 },
            functionCode: { type: "string", minLength: 1 },
            estimatedPoints: { type: "string", pattern: "^[0-9]+(\\.[0-9]{1,4})?$" },
            bizType: { type: "string", minLength: 1 },
            bizId: { type: "string", minLength: 1 },
            idempotencyKey: { type: "string", minLength: 1 }
          }
        },
        response: {
          200: billingTaskResponseSchema
        }
      }
    },
    async (request) =>
      billing.estimate({
        ...request.body,
        requestHash: requestHash(request.body)
      })
  );

  app.post<{ Body: TaskMutationBody }>(
    "/billing/freeze",
    {
      schema: {
        tags: ["billing"],
        body: taskMutationBodySchema,
        response: {
          200: billingTaskResponseSchema
        }
      }
    },
    async (request) =>
      billing.freeze({
        ...request.body,
        requestHash: requestHash(request.body)
      })
  );

  app.post<{ Body: TaskMutationBody }>(
    "/billing/settle",
    {
      schema: {
        tags: ["billing"],
        body: taskMutationBodySchema,
        response: {
          200: billingTaskResponseSchema
        }
      }
    },
    async (request) =>
      billing.settle({
        ...request.body,
        requestHash: requestHash(request.body)
      })
  );

  app.post<{ Body: TaskMutationBody }>(
    "/billing/refund",
    {
      schema: {
        tags: ["billing"],
        body: taskMutationBodySchema,
        response: {
          200: billingTaskResponseSchema
        }
      }
    },
    async (request) =>
      billing.refund({
        ...request.body,
        requestHash: requestHash(request.body)
      })
  );

  app.get<{ Params: IdParam; Querystring: UserQuery }>(
    "/billing/tasks/:id",
    {
      schema: {
        tags: ["billing"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "string" }
          }
        },
        response: {
          200: billingTaskResponseSchema
        }
      }
    },
    async (request) =>
      billing.getTask(
        parseRequiredNumber(request.params.id, "id"),
        parseRequiredNumber(request.query.userId, "userId")
      )
  );

  app.get<{ Params: IdParam; Querystring: UserQuery }>(
    "/accounts/:id/transactions",
    {
      schema: {
        tags: ["billing"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "string" },
            limit: { type: "string" }
          }
        }
      }
    },
    async (request) =>
      billing.listAccountTransactions({
        accountId: parseRequiredNumber(request.params.id, "id"),
        userId: parseRequiredNumber(request.query.userId, "userId"),
        limit: parseLimit(request.query.limit)
      })
  );
}

import type { FastifyInstance } from "fastify";
import { AgentApprovalService } from "../agent/agent-approval-service.js";
import { AgentService } from "../agent/agent-service.js";
import type { Database } from "../db/pool.js";
import { BadRequestError } from "../domain/index.js";
import { requestHash } from "./request-hash.js";

type RegisterAgentRoutesOptions = {
  db: Database;
};

type CreateRelationBody = {
  agentUserId: number;
  referredUserId: number;
  tenantId?: number | null;
  relationType: "direct" | "indirect";
  commissionRate: string;
  status?: string;
};

type GenerateCommissionBody = {
  sourceTransactionId: number;
};

type SettleCommissionBody = {
  idempotencyKey: string;
};

type ApplyForAgentBody = {
  userId: number;
};

type PlatformApprovalBody = {
  currentUserId: number;
};

type RejectAgentBody = PlatformApprovalBody & {
  reason?: string | null;
};

type IdParam = {
  id: string;
};

type UserParam = {
  userId: string;
};

type CommissionQuery = {
  agentUserId?: string;
  referredUserId?: string;
  status?: "pending" | "settled" | "cancelled";
  limit?: string;
};

type AgentApplicationQuery = {
  currentUserId?: string;
  status?: "pending" | "approved" | "rejected" | "suspended";
  limit?: string;
};

const relationSchema = {
  type: "object",
  required: [
    "id",
    "agentUserId",
    "referredUserId",
    "tenantId",
    "relationType",
    "commissionRate",
    "status"
  ],
  properties: {
    id: { type: "number" },
    agentUserId: { type: "number" },
    referredUserId: { type: "number" },
    tenantId: { type: ["number", "null"] },
    relationType: { type: "string", enum: ["direct", "indirect"] },
    commissionRate: { type: "string" },
    status: { type: "string" }
  }
};

const commissionSchema = {
  type: "object",
  required: [
    "id",
    "agentRelationId",
    "agentUserId",
    "referredUserId",
    "tenantId",
    "sourceBillingTaskId",
    "sourceTransactionId",
    "commissionTransactionId",
    "applicationId",
    "functionId",
    "consumedPoints",
    "commissionRate",
    "commissionPoints",
    "status",
    "createdAt",
    "settledAt",
    "cancelledAt"
  ],
  properties: {
    id: { type: "number" },
    agentRelationId: { type: "number" },
    agentUserId: { type: "number" },
    referredUserId: { type: "number" },
    tenantId: { type: ["number", "null"] },
    sourceBillingTaskId: { type: ["number", "null"] },
    sourceTransactionId: { type: "number" },
    commissionTransactionId: { type: ["number", "null"] },
    applicationId: { type: ["number", "null"] },
    functionId: { type: ["number", "null"] },
    consumedPoints: { type: "string" },
    commissionRate: { type: "string" },
    commissionPoints: { type: "string" },
    status: { type: "string", enum: ["pending", "settled", "cancelled"] },
    createdAt: { type: "string" },
    settledAt: { type: ["string", "null"] },
    cancelledAt: { type: ["string", "null"] },
    idempotentReplay: { type: "boolean" }
  }
};

const agentProfileSchema = {
  type: "object",
  required: [
    "id",
    "userId",
    "status",
    "appliedAt",
    "approvedByUserId",
    "approvedAt",
    "rejectedAt",
    "rejectedReason",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    id: { type: "number" },
    userId: { type: "number" },
    status: { type: "string", enum: ["pending", "approved", "rejected", "suspended"] },
    appliedAt: { type: "string" },
    approvedByUserId: { type: ["number", "null"] },
    approvedAt: { type: ["string", "null"] },
    rejectedAt: { type: ["string", "null"] },
    rejectedReason: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" }
  }
};

function parseOptionalNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseRequiredNumber(value: string | undefined, name: string): number {
  const parsed = parseOptionalNumber(value, name);
  if (parsed === undefined) {
    throw new BadRequestError(`${name} is required`);
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

export function registerAgentRoutes(app: FastifyInstance, options: RegisterAgentRoutesOptions): void {
  const agent = new AgentService(options.db);
  const approvals = new AgentApprovalService(options.db);

  app.post<{ Body: ApplyForAgentBody }>(
    "/agent-applications",
    {
      schema: {
        tags: ["agents"],
        body: {
          type: "object",
          required: ["userId"],
          additionalProperties: false,
          properties: {
            userId: { type: "number" }
          }
        },
        response: { 200: agentProfileSchema }
      }
    },
    async (request) => approvals.applyForAgent(request.body.userId)
  );

  app.get<{ Querystring: AgentApplicationQuery }>(
    "/platform/agent-applications",
    {
      schema: {
        tags: ["platform"],
        querystring: {
          type: "object",
          required: ["currentUserId"],
          properties: {
            currentUserId: { type: "string" },
            status: { type: "string", enum: ["pending", "approved", "rejected", "suspended"] },
            limit: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["applications"],
            properties: {
              applications: { type: "array", items: agentProfileSchema }
            }
          }
        }
      }
    },
    async (request) => {
      const input: {
        currentUserId: number;
        status?: "pending" | "approved" | "rejected" | "suspended";
        limit: number;
      } = {
        currentUserId: parseRequiredNumber(request.query.currentUserId, "currentUserId"),
        limit: parseLimit(request.query.limit)
      };
      if (request.query.status !== undefined) input.status = request.query.status;

      return approvals.listApplications(input);
    }
  );

  app.post<{ Params: UserParam; Body: PlatformApprovalBody }>(
    "/platform/agent-applications/:userId/approve",
    {
      schema: {
        tags: ["platform"],
        params: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["currentUserId"],
          additionalProperties: false,
          properties: {
            currentUserId: { type: "number" }
          }
        },
        response: { 200: agentProfileSchema }
      }
    },
    async (request) =>
      approvals.approveAgent({
        currentUserId: request.body.currentUserId,
        userId: parseRequiredNumber(request.params.userId, "userId")
      })
  );

  app.post<{ Params: UserParam; Body: RejectAgentBody }>(
    "/platform/agent-applications/:userId/reject",
    {
      schema: {
        tags: ["platform"],
        params: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["currentUserId"],
          additionalProperties: false,
          properties: {
            currentUserId: { type: "number" },
            reason: { type: ["string", "null"] }
          }
        },
        response: { 200: agentProfileSchema }
      }
    },
    async (request) =>
      approvals.rejectAgent({
        currentUserId: request.body.currentUserId,
        userId: parseRequiredNumber(request.params.userId, "userId"),
        reason: request.body.reason ?? null
      })
  );

  app.post<{ Params: UserParam; Body: PlatformApprovalBody }>(
    "/platform/agents/:userId/suspend",
    {
      schema: {
        tags: ["platform"],
        params: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["currentUserId"],
          additionalProperties: false,
          properties: {
            currentUserId: { type: "number" }
          }
        },
        response: { 200: agentProfileSchema }
      }
    },
    async (request) =>
      approvals.suspendAgent({
        currentUserId: request.body.currentUserId,
        userId: parseRequiredNumber(request.params.userId, "userId")
      })
  );

  app.post<{ Body: CreateRelationBody }>(
    "/agent-relations",
    {
      schema: {
        tags: ["agents"],
        body: {
          type: "object",
          required: ["agentUserId", "referredUserId", "relationType", "commissionRate"],
          additionalProperties: false,
          properties: {
            agentUserId: { type: "number" },
            referredUserId: { type: "number" },
            tenantId: { type: ["number", "null"] },
            relationType: { type: "string", enum: ["direct", "indirect"] },
            commissionRate: { type: "string", pattern: "^0(\\.\\d{1,4})?$|^1(\\.0{1,4})?$" },
            status: { type: "string" }
          }
        },
        response: { 200: relationSchema }
      }
    },
    async (request) => agent.createRelation(request.body)
  );

  app.get<{ Querystring: CommissionQuery }>(
    "/agent-commissions",
    {
      schema: {
        tags: ["agents"],
        querystring: {
          type: "object",
          properties: {
            agentUserId: { type: "string" },
            referredUserId: { type: "string" },
            status: { type: "string", enum: ["pending", "settled", "cancelled"] },
            limit: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["commissions"],
            properties: {
              commissions: { type: "array", items: commissionSchema }
            }
          }
        }
      }
    },
    async (request) => {
      const input: {
        agentUserId?: number;
        referredUserId?: number;
        status?: "pending" | "settled" | "cancelled";
        limit: number;
      } = {
        limit: parseLimit(request.query.limit)
      };
      const agentUserId = parseOptionalNumber(request.query.agentUserId, "agentUserId");
      const referredUserId = parseOptionalNumber(request.query.referredUserId, "referredUserId");

      if (agentUserId !== undefined) input.agentUserId = agentUserId;
      if (referredUserId !== undefined) input.referredUserId = referredUserId;
      if (request.query.status !== undefined) input.status = request.query.status;

      return agent.listCommissions(input);
    }
  );

  app.post<{ Body: GenerateCommissionBody }>(
    "/agent-commissions/generate",
    {
      schema: {
        tags: ["agents"],
        body: {
          type: "object",
          required: ["sourceTransactionId"],
          additionalProperties: false,
          properties: {
            sourceTransactionId: { type: "number" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["commissions"],
            properties: {
              commissions: { type: "array", items: commissionSchema }
            }
          }
        }
      }
    },
    async (request) => agent.generateFromSourceTransaction(request.body.sourceTransactionId)
  );

  app.post<{ Params: IdParam; Body: SettleCommissionBody }>(
    "/agent-commissions/:id/settle",
    {
      schema: {
        tags: ["agents"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["idempotencyKey"],
          additionalProperties: false,
          properties: {
            idempotencyKey: { type: "string", minLength: 1 }
          }
        },
        response: { 200: commissionSchema }
      }
    },
    async (request) =>
      agent.settleCommission({
        commissionId: parseRequiredNumber(request.params.id, "id"),
        idempotencyKey: request.body.idempotencyKey,
        requestHash: requestHash({
          commissionId: request.params.id
        })
      })
  );

  app.post<{ Params: IdParam }>(
    "/agent-commissions/:id/cancel",
    {
      schema: {
        tags: ["agents"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } }
        },
        response: { 200: commissionSchema }
      }
    },
    async (request) => agent.cancelCommission(parseRequiredNumber(request.params.id, "id"))
  );
}

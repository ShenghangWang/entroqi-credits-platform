import type { FastifyInstance } from "fastify";
import { AdminService } from "../admin/admin-service.js";
import type { Database } from "../db/pool.js";
import { BadRequestError } from "../domain/index.js";

type RegisterAdminRoutesOptions = {
  db: Database;
};

type TenantParam = {
  tenantId: string;
};

type IdParam = {
  id: string;
};

type CurrentUserQuery = {
  currentUserId?: string;
  userId?: string;
  limit?: string;
};

type AddTenantMemberBody = {
  currentUserId: number;
  userId: number;
  role: "owner" | "admin" | "employee";
  status?: "active" | "disabled" | "invited";
};

type UpdateTenantMemberStatusBody = {
  currentUserId: number;
  status: "active" | "disabled" | "invited";
};

const accountSchema = {
  type: "object",
  required: [
    "id",
    "tenantId",
    "userId",
    "accountScope",
    "totalBalance",
    "lockedBalance",
    "availableBalance",
    "currency",
    "status"
  ],
  properties: {
    id: { type: "number" },
    tenantId: { type: ["number", "null"] },
    userId: { type: ["number", "null"] },
    accountScope: { type: "string", enum: ["personal", "tenant"] },
    totalBalance: { type: "string" },
    lockedBalance: { type: "string" },
    availableBalance: { type: "string" },
    currency: { type: "string" },
    status: { type: "string" }
  }
};

const memberSchema = {
  type: "object",
  required: ["id", "tenantId", "userId", "role", "status", "joinedAt", "createdAt"],
  properties: {
    id: { type: "number" },
    tenantId: { type: "number" },
    userId: { type: "number" },
    role: { type: "string", enum: ["owner", "admin", "employee"] },
    status: { type: "string", enum: ["active", "disabled", "invited"] },
    joinedAt: { type: ["string", "null"] },
    createdAt: { type: "string" }
  }
};

const transactionSchema = {
  type: "object",
  required: [
    "id",
    "tenantId",
    "userId",
    "accountId",
    "billingTaskId",
    "paymentOrderId",
    "applicationId",
    "functionId",
    "txnType",
    "points",
    "balanceBefore",
    "balanceAfter",
    "bizType",
    "bizId",
    "refTxnId",
    "remark",
    "createdAt"
  ],
  properties: {
    id: { type: "number" },
    tenantId: { type: ["number", "null"] },
    userId: { type: "number" },
    accountId: { type: "number" },
    billingTaskId: { type: ["number", "null"] },
    paymentOrderId: { type: ["number", "null"] },
    applicationId: { type: ["number", "null"] },
    functionId: { type: ["number", "null"] },
    txnType: { type: "string" },
    points: { type: "string" },
    balanceBefore: { type: "string" },
    balanceAfter: { type: "string" },
    bizType: { type: ["string", "null"] },
    bizId: { type: ["string", "null"] },
    refTxnId: { type: ["number", "null"] },
    remark: { type: ["string", "null"] },
    createdAt: { type: "string" }
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

export function registerAdminRoutes(app: FastifyInstance, options: RegisterAdminRoutesOptions): void {
  const admin = new AdminService(options.db);

  app.get<{ Querystring: CurrentUserQuery }>(
    "/me/accounts",
    {
      schema: {
        tags: ["admin"],
        querystring: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["accounts"],
            properties: {
              accounts: { type: "array", items: accountSchema }
            }
          }
        }
      }
    },
    async (request) =>
      admin.listMyAccounts(parseRequiredNumber(request.query.userId, "userId"))
  );

  app.get<{ Params: TenantParam; Querystring: CurrentUserQuery }>(
    "/tenants/:tenantId/accounts",
    {
      schema: {
        tags: ["admin"],
        params: {
          type: "object",
          required: ["tenantId"],
          properties: { tenantId: { type: "string" } }
        },
        querystring: {
          type: "object",
          required: ["currentUserId"],
          properties: { currentUserId: { type: "string" } }
        },
        response: {
          200: {
            type: "object",
            required: ["accounts"],
            properties: {
              accounts: { type: "array", items: accountSchema }
            }
          }
        }
      }
    },
    async (request) =>
      admin.listTenantAccounts({
        tenantId: parseRequiredNumber(request.params.tenantId, "tenantId"),
        currentUserId: parseRequiredNumber(request.query.currentUserId, "currentUserId")
      })
  );

  app.get<{ Params: TenantParam; Querystring: CurrentUserQuery }>(
    "/tenants/:tenantId/transactions",
    {
      schema: {
        tags: ["admin"],
        params: {
          type: "object",
          required: ["tenantId"],
          properties: { tenantId: { type: "string" } }
        },
        querystring: {
          type: "object",
          required: ["currentUserId"],
          properties: {
            currentUserId: { type: "string" },
            limit: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["transactions"],
            properties: {
              transactions: { type: "array", items: transactionSchema }
            }
          }
        }
      }
    },
    async (request) =>
      admin.listTenantTransactions({
        tenantId: parseRequiredNumber(request.params.tenantId, "tenantId"),
        currentUserId: parseRequiredNumber(request.query.currentUserId, "currentUserId"),
        limit: parseLimit(request.query.limit)
      })
  );

  app.get<{ Params: TenantParam; Querystring: CurrentUserQuery }>(
    "/tenants/:tenantId/members",
    {
      schema: {
        tags: ["admin"],
        params: {
          type: "object",
          required: ["tenantId"],
          properties: { tenantId: { type: "string" } }
        },
        querystring: {
          type: "object",
          required: ["currentUserId"],
          properties: { currentUserId: { type: "string" } }
        },
        response: {
          200: {
            type: "object",
            required: ["members"],
            properties: {
              members: { type: "array", items: memberSchema }
            }
          }
        }
      }
    },
    async (request) =>
      admin.listTenantMembers({
        tenantId: parseRequiredNumber(request.params.tenantId, "tenantId"),
        currentUserId: parseRequiredNumber(request.query.currentUserId, "currentUserId")
      })
  );

  app.post<{ Params: TenantParam; Body: AddTenantMemberBody }>(
    "/tenants/:tenantId/members",
    {
      schema: {
        tags: ["admin"],
        params: {
          type: "object",
          required: ["tenantId"],
          properties: { tenantId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["currentUserId", "userId", "role"],
          additionalProperties: false,
          properties: {
            currentUserId: { type: "number" },
            userId: { type: "number" },
            role: { type: "string", enum: ["owner", "admin", "employee"] },
            status: { type: "string", enum: ["active", "disabled", "invited"] }
          }
        },
        response: { 200: memberSchema }
      }
    },
    async (request) =>
      admin.addTenantMember({
        tenantId: parseRequiredNumber(request.params.tenantId, "tenantId"),
        currentUserId: request.body.currentUserId,
        userId: request.body.userId,
        role: request.body.role,
        status: request.body.status ?? "invited"
      })
  );

  app.patch<{ Params: IdParam; Body: UpdateTenantMemberStatusBody }>(
    "/tenant-members/:id/status",
    {
      schema: {
        tags: ["admin"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["currentUserId", "status"],
          additionalProperties: false,
          properties: {
            currentUserId: { type: "number" },
            status: { type: "string", enum: ["active", "disabled", "invited"] }
          }
        },
        response: { 200: memberSchema }
      }
    },
    async (request) =>
      admin.updateTenantMemberStatus({
        memberId: parseRequiredNumber(request.params.id, "id"),
        currentUserId: request.body.currentUserId,
        status: request.body.status
      })
  );
}

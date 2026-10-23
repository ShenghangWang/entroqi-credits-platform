import type { Database, DatabaseClient } from "../db/pool.js";
import { AgentApprovalService } from "./agent-approval-service.js";
import {
  absolutePoints,
  AccountResolver,
  BadRequestError,
  BalanceService,
  ConflictError,
  CreditLedgerService,
  IdempotencyService,
  multiplyPointsByRate,
  NotFoundError
} from "../domain/index.js";

type RelationType = "direct" | "indirect";
type CommissionStatus = "pending" | "settled" | "cancelled";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type AgentRelationRow = {
  id: string;
  agent_user_id: string;
  referred_user_id: string;
  tenant_id: string | null;
  relation_type: RelationType;
  commission_rate: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type SourceTransactionRow = {
  id: string;
  tenant_id: string | null;
  user_id: string;
  account_id: string;
  billing_task_id: string | null;
  application_id: string | null;
  function_id: string | null;
  txn_type: string;
  points: string;
  biz_type: string | null;
  biz_id: string | null;
};

type AgentCommissionRow = {
  id: string;
  agent_relation_id: string;
  agent_user_id: string;
  referred_user_id: string;
  tenant_id: string | null;
  source_billing_task_id: string | null;
  source_transaction_id: string;
  commission_transaction_id: string | null;
  application_id: string | null;
  function_id: string | null;
  consumed_points: string;
  commission_rate: string;
  commission_points: string;
  status: CommissionStatus;
  created_at: Date;
  settled_at: Date | null;
  cancelled_at: Date | null;
};

export type AgentRelationResponse = JsonObject & {
  id: number;
  agentUserId: number;
  referredUserId: number;
  tenantId: number | null;
  relationType: RelationType;
  commissionRate: string;
  status: string;
};

export type AgentCommissionResponse = JsonObject & {
  id: number;
  agentRelationId: number;
  agentUserId: number;
  referredUserId: number;
  tenantId: number | null;
  sourceBillingTaskId: number | null;
  sourceTransactionId: number;
  commissionTransactionId: number | null;
  applicationId: number | null;
  functionId: number | null;
  consumedPoints: string;
  commissionRate: string;
  commissionPoints: string;
  status: CommissionStatus;
  createdAt: string;
  settledAt: string | null;
  cancelledAt: string | null;
  idempotentReplay?: boolean;
};

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapRelation(row: AgentRelationRow): AgentRelationResponse {
  return {
    id: Number(row.id),
    agentUserId: Number(row.agent_user_id),
    referredUserId: Number(row.referred_user_id),
    tenantId: optionalNumber(row.tenant_id),
    relationType: row.relation_type,
    commissionRate: row.commission_rate,
    status: row.status
  };
}

function mapCommission(row: AgentCommissionRow): AgentCommissionResponse {
  return {
    id: Number(row.id),
    agentRelationId: Number(row.agent_relation_id),
    agentUserId: Number(row.agent_user_id),
    referredUserId: Number(row.referred_user_id),
    tenantId: optionalNumber(row.tenant_id),
    sourceBillingTaskId: optionalNumber(row.source_billing_task_id),
    sourceTransactionId: Number(row.source_transaction_id),
    commissionTransactionId: optionalNumber(row.commission_transaction_id),
    applicationId: optionalNumber(row.application_id),
    functionId: optionalNumber(row.function_id),
    consumedPoints: row.consumed_points,
    commissionRate: row.commission_rate,
    commissionPoints: row.commission_points,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null
  };
}

function replayResponse(responseBody: unknown): JsonObject {
  if (responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)) {
    return {
      ...(responseBody as JsonObject),
      idempotentReplay: true
    };
  }

  return { idempotentReplay: true };
}

export class AgentService {
  private readonly approvalService: AgentApprovalService;
  private readonly balanceService: BalanceService;

  constructor(private readonly db: Database) {
    this.approvalService = new AgentApprovalService(db);
    this.balanceService = new BalanceService(db);
  }

  async createRelation(input: {
    agentUserId: number;
    referredUserId: number;
    tenantId?: number | null;
    relationType: RelationType;
    commissionRate: string;
    status?: string;
  }): Promise<AgentRelationResponse> {
    return this.db.withTransaction(async (client) => {
      await this.approvalService.requireApprovedAgent(client, input.agentUserId);
      const result = await client.query<AgentRelationRow>(
        `
          insert into agent_relations (
            agent_user_id, referred_user_id, tenant_id, relation_type, commission_rate, status
          )
          values ($1, $2, $3, $4, $5, $6)
          returning id, agent_user_id, referred_user_id, tenant_id, relation_type,
                    commission_rate, status, created_at, updated_at
        `,
        [
          input.agentUserId,
          input.referredUserId,
          input.tenantId ?? null,
          input.relationType,
          input.commissionRate,
          input.status ?? "active"
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Agent relation insert did not return a row");
      }

      return mapRelation(row);
    });
  }

  async listCommissions(input: {
    agentUserId?: number;
    referredUserId?: number;
    status?: CommissionStatus;
    limit: number;
  }): Promise<{ commissions: AgentCommissionResponse[] }> {
    const result = await this.db.query<AgentCommissionRow>(
      `
        select id, agent_relation_id, agent_user_id, referred_user_id, tenant_id,
               source_billing_task_id, source_transaction_id, commission_transaction_id,
               application_id, function_id, consumed_points, commission_rate,
               commission_points, status, created_at, settled_at, cancelled_at
        from agent_commissions
        where ($1::bigint is null or agent_user_id = $1)
          and ($2::bigint is null or referred_user_id = $2)
          and ($3::agent_commission_status is null or status = $3)
        order by created_at desc, id desc
        limit $4
      `,
      [input.agentUserId ?? null, input.referredUserId ?? null, input.status ?? null, input.limit]
    );

    return {
      commissions: result.rows.map((row) => mapCommission(row))
    };
  }

  async generateFromSourceTransaction(sourceTransactionId: number): Promise<{
    commissions: AgentCommissionResponse[];
  }> {
    return this.db.withTransaction(async (client) => {
      const source = await this.getSourceTransactionForUpdate(client, sourceTransactionId);
      if (source.txn_type !== "settle") {
        throw new BadRequestError("Agent commissions can only be generated from settle transactions");
      }

      const existing = await client.query<{ id: string }>(
        `
          select id
          from agent_commissions
          where source_transaction_id = $1
          limit 1
        `,
        [sourceTransactionId]
      );

      if (existing.rows[0]) {
        throw new ConflictError(`Commissions already generated for transaction ${sourceTransactionId}`);
      }

      const relations = await client.query<AgentRelationRow>(
        `
          select agent_relations.id, agent_user_id, referred_user_id, tenant_id, relation_type,
                 commission_rate, agent_relations.status, agent_relations.created_at,
                 agent_relations.updated_at
          from agent_relations
          join agent_profiles
            on agent_profiles.user_id = agent_relations.agent_user_id
           and agent_profiles.status = 'approved'
          where agent_relations.referred_user_id = $1
            and agent_relations.status = 'active'
            and (agent_relations.tenant_id is null or agent_relations.tenant_id is not distinct from $2::bigint)
          order by agent_relations.relation_type asc, agent_relations.id asc
        `,
        [source.user_id, source.tenant_id]
      );

      const consumedPoints = absolutePoints(source.points);
      const commissions: AgentCommissionResponse[] = [];

      for (const relation of relations.rows) {
        const commissionPoints = multiplyPointsByRate(consumedPoints, relation.commission_rate);
        const inserted = await this.insertCommission(client, {
          relation,
          source,
          consumedPoints,
          commissionPoints
        });
        commissions.push(mapCommission(inserted));
      }

      return { commissions };
    });
  }

  async settleCommission(input: {
    commissionId: number;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<JsonObject> {
    return this.db.withTransaction(async (client) => {
      const commission = await this.getCommissionForUpdate(client, input.commissionId);
      const idempotency = new IdempotencyService(client);
      const reservation = await idempotency.reserve({
        userId: Number(commission.agent_user_id),
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      if (reservation.kind === "replay") {
        return replayResponse(reservation.responseBody);
      }

      if (reservation.kind === "in_progress") {
        throw new ConflictError("Commission settlement is already processing");
      }

      if (commission.status === "settled") {
        const response = mapCommission(commission);
        await idempotency.complete(reservation.id, response);
        return response;
      }

      if (commission.status !== "pending") {
        throw new ConflictError(`Commission ${input.commissionId} is not pending`);
      }

      await this.approvalService.requireApprovedAgent(client, Number(commission.agent_user_id));
      const account = await new AccountResolver(client).resolvePersonalAccount(
        Number(commission.agent_user_id)
      );
      const lockedAccount = await this.balanceService.lockAccountForUpdate(account.id, client);
      const updatedAccount = await this.balanceService.increaseTotalBalance({
        account: lockedAccount,
        points: commission.commission_points,
        client
      });
      const transaction = await new CreditLedgerService(client).createTransaction({
        tenantId: optionalNumber(commission.tenant_id),
        userId: Number(commission.agent_user_id),
        accountId: account.id,
        billingTaskId: optionalNumber(commission.source_billing_task_id),
        applicationId: optionalNumber(commission.application_id),
        functionId: optionalNumber(commission.function_id),
        txnType: "commission_grant",
        points: commission.commission_points,
        balanceBefore: lockedAccount.totalBalance,
        balanceAfter: updatedAccount.totalBalance,
        bizType: "agent_commission",
        bizId: commission.id,
        refTxnId: Number(commission.source_transaction_id),
        remark: "agent commission grant"
      });
      const settled = await this.updateCommissionSettlement(client, {
        commissionId: input.commissionId,
        transactionId: transaction.id
      });
      const response = mapCommission(settled);
      await idempotency.complete(reservation.id, response);
      return response;
    });
  }

  async cancelCommission(commissionId: number): Promise<AgentCommissionResponse> {
    return this.db.withTransaction(async (client) => {
      const commission = await this.getCommissionForUpdate(client, commissionId);
      if (commission.status === "settled") {
        throw new ConflictError(`Settled commission ${commissionId} cannot be cancelled`);
      }

      const result = await client.query<AgentCommissionRow>(
        `
          update agent_commissions
          set status = 'cancelled',
              cancelled_at = now()
          where id = $1
          returning id, agent_relation_id, agent_user_id, referred_user_id, tenant_id,
                    source_billing_task_id, source_transaction_id, commission_transaction_id,
                    application_id, function_id, consumed_points, commission_rate,
                    commission_points, status, created_at, settled_at, cancelled_at
        `,
        [commissionId]
      );

      const row = result.rows[0];
      if (!row) {
        throw new NotFoundError(`Agent commission not found while cancelling: ${commissionId}`);
      }

      return mapCommission(row);
    });
  }

  private async getSourceTransactionForUpdate(
    client: DatabaseClient,
    sourceTransactionId: number
  ): Promise<SourceTransactionRow> {
    const result = await client.query<SourceTransactionRow>(
      `
        select id, tenant_id, user_id, account_id, billing_task_id, application_id,
               function_id, txn_type, points, biz_type, biz_id
        from credit_transactions
        where id = $1
        for update
      `,
      [sourceTransactionId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Source transaction not found: ${sourceTransactionId}`);
    }

    return row;
  }

  private async insertCommission(
    client: DatabaseClient,
    input: {
      relation: AgentRelationRow;
      source: SourceTransactionRow;
      consumedPoints: string;
      commissionPoints: string;
    }
  ): Promise<AgentCommissionRow> {
    const result = await client.query<AgentCommissionRow>(
      `
        insert into agent_commissions (
          agent_relation_id, agent_user_id, referred_user_id, tenant_id,
          source_billing_task_id, source_transaction_id, application_id, function_id,
          consumed_points, commission_rate, commission_points, status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
        returning id, agent_relation_id, agent_user_id, referred_user_id, tenant_id,
                  source_billing_task_id, source_transaction_id, commission_transaction_id,
                  application_id, function_id, consumed_points, commission_rate,
                  commission_points, status, created_at, settled_at, cancelled_at
      `,
      [
        input.relation.id,
        input.relation.agent_user_id,
        input.relation.referred_user_id,
        input.source.tenant_id,
        input.source.billing_task_id,
        input.source.id,
        input.source.application_id,
        input.source.function_id,
        input.consumedPoints,
        input.relation.commission_rate,
        input.commissionPoints
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Agent commission insert did not return a row");
    }

    return row;
  }

  private async getCommissionForUpdate(
    client: DatabaseClient,
    commissionId: number
  ): Promise<AgentCommissionRow> {
    const result = await client.query<AgentCommissionRow>(
      `
        select id, agent_relation_id, agent_user_id, referred_user_id, tenant_id,
               source_billing_task_id, source_transaction_id, commission_transaction_id,
               application_id, function_id, consumed_points, commission_rate,
               commission_points, status, created_at, settled_at, cancelled_at
        from agent_commissions
        where id = $1
        for update
      `,
      [commissionId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Agent commission not found: ${commissionId}`);
    }

    return row;
  }

  private async updateCommissionSettlement(
    client: DatabaseClient,
    input: {
      commissionId: number;
      transactionId: number;
    }
  ): Promise<AgentCommissionRow> {
    const result = await client.query<AgentCommissionRow>(
      `
        update agent_commissions
        set status = 'settled',
            settled_at = now(),
            commission_transaction_id = $2
        where id = $1
        returning id, agent_relation_id, agent_user_id, referred_user_id, tenant_id,
                  source_billing_task_id, source_transaction_id, commission_transaction_id,
                  application_id, function_id, consumed_points, commission_rate,
                  commission_points, status, created_at, settled_at, cancelled_at
      `,
      [input.commissionId, input.transactionId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Agent commission not found while settling: ${input.commissionId}`);
    }

    return row;
  }
}

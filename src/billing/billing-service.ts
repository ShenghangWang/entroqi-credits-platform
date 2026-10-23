import type { Database, DatabaseClient } from "../db/pool.js";
import {
  AccountResolver,
  ApplicationRegistry,
  BadRequestError,
  BalanceService,
  ConflictError,
  CreditLedgerService,
  IdempotencyService,
  NotFoundError,
  fromScaledPoints,
  negatePoints,
  toScaledPoints
} from "../domain/index.js";

type AccountScope = "personal" | "tenant";
type BillingTaskStatus = "estimated" | "frozen" | "settled" | "refunded" | "failed" | "cancelled";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type BillingTaskRow = {
  id: string;
  tenant_id: string | null;
  user_id: string;
  account_id: string;
  application_id: string;
  function_id: string;
  biz_type: string;
  biz_id: string;
  estimated_points: string;
  frozen_points: string;
  settled_points: string;
  status: BillingTaskStatus;
  created_at: Date;
  updated_at: Date;
};

type BillingLockRow = {
  id: string;
  points: string;
  status: string;
};

type TransactionRow = {
  id: string;
  tenant_id: string | null;
  user_id: string;
  account_id: string;
  billing_task_id: string | null;
  payment_order_id: string | null;
  application_id: string | null;
  function_id: string | null;
  txn_type: string;
  points: string;
  balance_before: string;
  balance_after: string;
  biz_type: string | null;
  biz_id: string | null;
  ref_txn_id: string | null;
  remark: string | null;
  created_at: Date;
};

export type EstimateBillingInput = {
  userId: number;
  accountScope: AccountScope;
  tenantId?: number;
  applicationCode: string;
  functionCode: string;
  estimatedPoints?: string;
  bizType: string;
  bizId: string;
  idempotencyKey: string;
  requestHash: string;
};

export type BillingTaskMutationInput = {
  userId: number;
  billingTaskId: number;
  idempotencyKey: string;
  requestHash: string;
};

export type BillingTaskResponse = JsonObject & {
  billingTaskId: number;
  tenantId: number | null;
  userId: number;
  accountId: number;
  applicationId: number;
  functionId: number;
  bizType: string;
  bizId: string;
  estimatedPoints: string;
  frozenPoints: string;
  settledPoints: string;
  status: BillingTaskStatus;
  idempotentReplay: boolean;
};

export type BillingTransactionResponse = JsonObject & {
  id: number;
  tenantId: number | null;
  userId: number;
  accountId: number;
  billingTaskId: number | null;
  paymentOrderId: number | null;
  applicationId: number | null;
  functionId: number | null;
  txnType: string;
  points: string;
  balanceBefore: string;
  balanceAfter: string;
  bizType: string | null;
  bizId: string | null;
  refTxnId: number | null;
  remark: string | null;
  createdAt: string;
};

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function resolveEstimatedPoints(defaultPoints: string, override?: string): string {
  if (override === undefined) return defaultPoints;

  try {
    const scaled = toScaledPoints(override);
    if (scaled <= 0n) {
      throw new BadRequestError("estimatedPoints must be greater than 0");
    }
    return fromScaledPoints(scaled);
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError("estimatedPoints must be a positive point amount with up to 4 decimal places");
  }
}

function mapTask(row: BillingTaskRow, idempotentReplay = false): BillingTaskResponse {
  return {
    billingTaskId: Number(row.id),
    tenantId: optionalNumber(row.tenant_id),
    userId: Number(row.user_id),
    accountId: Number(row.account_id),
    applicationId: Number(row.application_id),
    functionId: Number(row.function_id),
    bizType: row.biz_type,
    bizId: row.biz_id,
    estimatedPoints: row.estimated_points,
    frozenPoints: row.frozen_points,
    settledPoints: row.settled_points,
    status: row.status,
    idempotentReplay
  };
}

function mapTransaction(row: TransactionRow): BillingTransactionResponse {
  return {
    id: Number(row.id),
    tenantId: optionalNumber(row.tenant_id),
    userId: Number(row.user_id),
    accountId: Number(row.account_id),
    billingTaskId: optionalNumber(row.billing_task_id),
    paymentOrderId: optionalNumber(row.payment_order_id),
    applicationId: optionalNumber(row.application_id),
    functionId: optionalNumber(row.function_id),
    txnType: row.txn_type,
    points: row.points,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    bizType: row.biz_type,
    bizId: row.biz_id,
    refTxnId: optionalNumber(row.ref_txn_id),
    remark: row.remark,
    createdAt: row.created_at.toISOString()
  };
}

function replayResponse(responseBody: unknown): JsonObject {
  if (responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)) {
    return {
      ...(responseBody as JsonObject),
      idempotentReplay: true
    };
  }

  return {
    idempotentReplay: true,
    responseBody: null
  };
}

export class BillingService {
  private readonly balanceService: BalanceService;

  constructor(private readonly db: Database) {
    this.balanceService = new BalanceService(db);
  }

  async estimate(input: EstimateBillingInput): Promise<JsonObject> {
    return this.executeIdempotent(input, async (client) => {
      const accountResolver = new AccountResolver(client);
      const applicationRegistry = new ApplicationRegistry(client);
      const ledger = new CreditLedgerService(client);

      const account =
        input.accountScope === "tenant"
          ? await accountResolver.resolveTenantAccount(input.userId, requiredTenantId(input.tenantId))
          : await accountResolver.resolvePersonalAccount(input.userId);
      const appFunction = await applicationRegistry.resolveFunction(
        input.applicationCode,
        input.functionCode
      );
      const estimatedPoints = resolveEstimatedPoints(appFunction.defaultPoints, input.estimatedPoints);

      const task = await this.createBillingTask(client, {
        tenantId: account.tenantId,
        userId: input.userId,
        accountId: account.id,
        applicationId: appFunction.applicationId,
        functionId: appFunction.functionId,
        bizType: input.bizType,
        bizId: input.bizId,
        estimatedPoints
      });

      await ledger.createTransaction({
        tenantId: account.tenantId,
        userId: input.userId,
        accountId: account.id,
        billingTaskId: Number(task.id),
        applicationId: appFunction.applicationId,
        functionId: appFunction.functionId,
        txnType: "estimate",
        points: estimatedPoints,
        balanceBefore: account.totalBalance,
        balanceAfter: account.totalBalance,
        bizType: input.bizType,
        bizId: input.bizId,
        remark: "billing estimate"
      });

      return mapTask(task);
    });
  }

  async freeze(input: BillingTaskMutationInput): Promise<JsonObject> {
    return this.executeIdempotent(input, async (client) => {
      const task = await this.getTaskForUpdate(client, input.billingTaskId, input.userId);
      if (task.status !== "estimated") {
        throw new ConflictError(`Billing task ${input.billingTaskId} is not estimated`);
      }

      const account = await this.balanceService.lockAccountForUpdate(Number(task.account_id), client);
      const updatedAccount = await this.balanceService.freezeCredits({
        account,
        points: task.estimated_points,
        client
      });

      await this.createBillingLock(client, task, task.estimated_points);
      const updatedTask = await this.updateTaskStatus(client, Number(task.id), {
        status: "frozen",
        frozenPoints: task.estimated_points,
        settledPoints: task.settled_points
      });
      await new CreditLedgerService(client).createTransaction({
        tenantId: optionalNumber(task.tenant_id),
        userId: Number(task.user_id),
        accountId: Number(task.account_id),
        billingTaskId: Number(task.id),
        applicationId: Number(task.application_id),
        functionId: Number(task.function_id),
        txnType: "freeze",
        points: negatePoints(task.estimated_points),
        balanceBefore: account.totalBalance,
        balanceAfter: updatedAccount.totalBalance,
        bizType: task.biz_type,
        bizId: task.biz_id,
        remark: "credits frozen"
      });

      return mapTask(updatedTask);
    });
  }

  async settle(input: BillingTaskMutationInput): Promise<JsonObject> {
    return this.executeIdempotent(input, async (client) => {
      const task = await this.getTaskForUpdate(client, input.billingTaskId, input.userId);
      if (task.status !== "frozen") {
        throw new ConflictError(`Billing task ${input.billingTaskId} is not frozen`);
      }

      const lock = await this.getActiveLockForUpdate(client, Number(task.id));
      const account = await this.balanceService.lockAccountForUpdate(Number(task.account_id), client);
      const updatedAccount = await this.balanceService.settleFrozenCredits({
        account,
        points: lock.points,
        client
      });

      await this.releaseBillingLock(client, Number(lock.id), "settle");
      const updatedTask = await this.updateTaskStatus(client, Number(task.id), {
        status: "settled",
        frozenPoints: task.frozen_points,
        settledPoints: lock.points
      });
      await new CreditLedgerService(client).createTransaction({
        tenantId: optionalNumber(task.tenant_id),
        userId: Number(task.user_id),
        accountId: Number(task.account_id),
        billingTaskId: Number(task.id),
        applicationId: Number(task.application_id),
        functionId: Number(task.function_id),
        txnType: "settle",
        points: negatePoints(lock.points),
        balanceBefore: account.totalBalance,
        balanceAfter: updatedAccount.totalBalance,
        bizType: task.biz_type,
        bizId: task.biz_id,
        remark: "credits settled"
      });

      return mapTask(updatedTask);
    });
  }

  async refund(input: BillingTaskMutationInput): Promise<JsonObject> {
    return this.executeIdempotent(input, async (client) => {
      const task = await this.getTaskForUpdate(client, input.billingTaskId, input.userId);
      if (task.status !== "frozen") {
        throw new ConflictError(`Billing task ${input.billingTaskId} is not frozen`);
      }

      const lock = await this.getActiveLockForUpdate(client, Number(task.id));
      const account = await this.balanceService.lockAccountForUpdate(Number(task.account_id), client);
      const updatedAccount = await this.balanceService.releaseFrozenCredits({
        account,
        points: lock.points,
        client
      });

      await this.releaseBillingLock(client, Number(lock.id), "freeze");
      const updatedTask = await this.updateTaskStatus(client, Number(task.id), {
        status: "refunded",
        frozenPoints: task.frozen_points,
        settledPoints: task.settled_points
      });
      await new CreditLedgerService(client).createTransaction({
        tenantId: optionalNumber(task.tenant_id),
        userId: Number(task.user_id),
        accountId: Number(task.account_id),
        billingTaskId: Number(task.id),
        applicationId: Number(task.application_id),
        functionId: Number(task.function_id),
        txnType: "refund",
        points: lock.points,
        balanceBefore: account.totalBalance,
        balanceAfter: updatedAccount.totalBalance,
        bizType: task.biz_type,
        bizId: task.biz_id,
        remark: "frozen credits released"
      });

      return mapTask(updatedTask);
    });
  }

  async getTask(taskId: number, userId: number): Promise<BillingTaskResponse> {
    const result = await this.db.query<BillingTaskRow>(
      `
        select id, tenant_id, user_id, account_id, application_id, function_id,
               biz_type, biz_id, estimated_points, frozen_points, settled_points,
               status, created_at, updated_at
        from billing_tasks
        where id = $1
          and user_id = $2
        limit 1
      `,
      [taskId, userId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Billing task not found: ${taskId}`);
    }

    return mapTask(row);
  }

  async listAccountTransactions(input: {
    accountId: number;
    userId: number;
    limit: number;
  }): Promise<{ transactions: BillingTransactionResponse[] }> {
    const limit = Math.min(Math.max(Math.trunc(input.limit || 20), 1), 200);
    const result = await this.db.query<TransactionRow>(
      `
        select id, tenant_id, user_id, account_id, billing_task_id, payment_order_id,
               application_id, function_id, txn_type, points, balance_before,
               balance_after, biz_type, biz_id, ref_txn_id, remark, created_at
        from credit_transactions
        where account_id = $1
          and user_id = $2
        order by created_at desc, id desc
        limit ${limit}
      `,
      [input.accountId, input.userId]
    );

    return {
      transactions: result.rows.map((row) => mapTransaction(row))
    };
  }

  private async executeIdempotent(
    input: { userId: number; idempotencyKey: string; requestHash: string },
    operation: (client: DatabaseClient) => Promise<JsonObject>
  ): Promise<JsonObject> {
    return this.db.withTransaction(async (client) => {
      const idempotency = new IdempotencyService(client);
      const reservation = await idempotency.reserve({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      if (reservation.kind === "replay") {
        return replayResponse(reservation.responseBody);
      }

      if (reservation.kind === "in_progress") {
        throw new ConflictError("Idempotent operation is already processing");
      }

      const response = await operation(client);
      await idempotency.complete(reservation.id, response);
      return response;
    });
  }

  private async createBillingTask(
    client: DatabaseClient,
    input: {
      tenantId: number | null;
      userId: number;
      accountId: number;
      applicationId: number;
      functionId: number;
      bizType: string;
      bizId: string;
      estimatedPoints: string;
    }
  ): Promise<BillingTaskRow> {
    const result = await client.query<BillingTaskRow>(
      `
        insert into billing_tasks (
          tenant_id, user_id, account_id, application_id, function_id,
          biz_type, biz_id, estimated_points, frozen_points, settled_points, status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 'estimated')
        returning id, tenant_id, user_id, account_id, application_id, function_id,
                  biz_type, biz_id, estimated_points, frozen_points, settled_points,
                  status, created_at, updated_at
      `,
      [
        input.tenantId,
        input.userId,
        input.accountId,
        input.applicationId,
        input.functionId,
        input.bizType,
        input.bizId,
        input.estimatedPoints
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Billing task insert did not return a row");
    }

    return row;
  }

  private async getTaskForUpdate(
    client: DatabaseClient,
    taskId: number,
    userId: number
  ): Promise<BillingTaskRow> {
    const result = await client.query<BillingTaskRow>(
      `
        select id, tenant_id, user_id, account_id, application_id, function_id,
               biz_type, biz_id, estimated_points, frozen_points, settled_points,
               status, created_at, updated_at
        from billing_tasks
        where id = $1
          and user_id = $2
        for update
      `,
      [taskId, userId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Billing task not found: ${taskId}`);
    }

    return row;
  }

  private async createBillingLock(
    client: DatabaseClient,
    task: BillingTaskRow,
    points: string
  ): Promise<void> {
    await client.query(
      `
        insert into billing_locks (
          billing_task_id, tenant_id, user_id, account_id, lock_type, points, status
        )
        values ($1, $2, $3, $4, 'freeze', $5, 'active')
      `,
      [task.id, task.tenant_id, task.user_id, task.account_id, points]
    );
  }

  private async getActiveLockForUpdate(
    client: DatabaseClient,
    billingTaskId: number
  ): Promise<BillingLockRow> {
    const result = await client.query<BillingLockRow>(
      `
        select id, points, status
        from billing_locks
        where billing_task_id = $1
          and status = 'active'
        for update
      `,
      [billingTaskId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Active billing lock not found for task ${billingTaskId}`);
    }

    return row;
  }

  private async releaseBillingLock(
    client: DatabaseClient,
    billingLockId: number,
    lockType: "freeze" | "settle"
  ): Promise<void> {
    await client.query(
      `
        update billing_locks
        set status = 'released',
            lock_type = $2,
            updated_at = now()
        where id = $1
      `,
      [billingLockId, lockType]
    );
  }

  private async updateTaskStatus(
    client: DatabaseClient,
    taskId: number,
    input: {
      status: BillingTaskStatus;
      frozenPoints: string;
      settledPoints: string;
    }
  ): Promise<BillingTaskRow> {
    const result = await client.query<BillingTaskRow>(
      `
        update billing_tasks
        set status = $2,
            frozen_points = $3,
            settled_points = $4,
            updated_at = now()
        where id = $1
        returning id, tenant_id, user_id, account_id, application_id, function_id,
                  biz_type, biz_id, estimated_points, frozen_points, settled_points,
                  status, created_at, updated_at
      `,
      [taskId, input.status, input.frozenPoints, input.settledPoints]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Billing task not found while updating status: ${taskId}`);
    }

    return row;
  }
}

function requiredTenantId(tenantId: number | undefined): number {
  if (tenantId === undefined) {
    throw new BadRequestError("tenantId is required for tenant billing");
  }

  return tenantId;
}

import type { Database, DatabaseClient } from "../db/pool.js";
import { ForbiddenError, NotFoundError } from "../domain/index.js";

type TenantRole = "owner" | "admin" | "employee";
type TenantMemberStatus = "active" | "disabled" | "invited";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type AccountRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  account_scope: "personal" | "tenant";
  total_balance: string;
  locked_balance: string;
  available_balance: string;
  currency: string;
  status: string;
};

type TenantMemberRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  status: TenantMemberStatus;
  joined_at: Date | null;
  created_at: Date;
};

type CreditTransactionRow = {
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

export type AccountResponse = JsonObject & {
  id: number;
  tenantId: number | null;
  userId: number | null;
  accountScope: "personal" | "tenant";
  totalBalance: string;
  lockedBalance: string;
  availableBalance: string;
  currency: string;
  status: string;
};

export type TenantMemberResponse = JsonObject & {
  id: number;
  tenantId: number;
  userId: number;
  role: TenantRole;
  status: TenantMemberStatus;
  joinedAt: string | null;
  createdAt: string;
};

export type TransactionResponse = JsonObject & {
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

function mapAccount(row: AccountRow): AccountResponse {
  return {
    id: Number(row.id),
    tenantId: optionalNumber(row.tenant_id),
    userId: optionalNumber(row.user_id),
    accountScope: row.account_scope,
    totalBalance: row.total_balance,
    lockedBalance: row.locked_balance,
    availableBalance: row.available_balance,
    currency: row.currency,
    status: row.status
  };
}

function mapMember(row: TenantMemberRow): TenantMemberResponse {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    userId: Number(row.user_id),
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at ? row.joined_at.toISOString() : null,
    createdAt: row.created_at.toISOString()
  };
}

function mapTransaction(row: CreditTransactionRow): TransactionResponse {
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

export class AdminService {
  constructor(private readonly db: Database) {}

  async listMyAccounts(userId: number): Promise<{ accounts: AccountResponse[] }> {
    const result = await this.db.query<AccountRow>(
      `
        select id, tenant_id, user_id, account_scope, total_balance, locked_balance,
               available_balance, currency, status
        from credit_accounts
        where user_id = $1
           or tenant_id in (
             select tenant_id
             from tenant_members
             where user_id = $1
               and status = 'active'
           )
        order by account_scope asc, id asc
      `,
      [userId]
    );

    return {
      accounts: result.rows.map((row) => mapAccount(row))
    };
  }

  async listTenantAccounts(input: {
    currentUserId: number;
    tenantId: number;
  }): Promise<{ accounts: AccountResponse[] }> {
    await this.requireTenantAdmin(this.db, input.currentUserId, input.tenantId);
    const result = await this.db.query<AccountRow>(
      `
        select id, tenant_id, user_id, account_scope, total_balance, locked_balance,
               available_balance, currency, status
        from credit_accounts
        where tenant_id = $1
        order by id asc
      `,
      [input.tenantId]
    );

    return {
      accounts: result.rows.map((row) => mapAccount(row))
    };
  }

  async listTenantTransactions(input: {
    currentUserId: number;
    tenantId: number;
    limit: number;
  }): Promise<{ transactions: TransactionResponse[] }> {
    await this.requireTenantAdmin(this.db, input.currentUserId, input.tenantId);
    const result = await this.db.query<CreditTransactionRow>(
      `
        select id, tenant_id, user_id, account_id, billing_task_id, payment_order_id,
               application_id, function_id, txn_type, points, balance_before,
               balance_after, biz_type, biz_id, ref_txn_id, remark, created_at
        from credit_transactions
        where tenant_id = $1
        order by created_at desc, id desc
        limit $2
      `,
      [input.tenantId, input.limit]
    );

    return {
      transactions: result.rows.map((row) => mapTransaction(row))
    };
  }

  async listTenantMembers(input: {
    currentUserId: number;
    tenantId: number;
  }): Promise<{ members: TenantMemberResponse[] }> {
    await this.requireTenantAdmin(this.db, input.currentUserId, input.tenantId);
    const result = await this.db.query<TenantMemberRow>(
      `
        select id, tenant_id, user_id, role, status, joined_at, created_at
        from tenant_members
        where tenant_id = $1
        order by created_at asc, id asc
      `,
      [input.tenantId]
    );

    return {
      members: result.rows.map((row) => mapMember(row))
    };
  }

  async addTenantMember(input: {
    currentUserId: number;
    tenantId: number;
    userId: number;
    role: TenantRole;
    status: TenantMemberStatus;
  }): Promise<TenantMemberResponse> {
    return this.db.withTransaction(async (client) => {
      await this.requireTenantAdmin(client, input.currentUserId, input.tenantId);
      const result = await client.query<TenantMemberRow>(
        `
          insert into tenant_members (tenant_id, user_id, role, status, joined_at)
          values (
            $1,
            $2,
            $3,
            $4,
            case when $4 = 'active' then now() else null end
          )
          on conflict (tenant_id, user_id) do update
          set role = excluded.role,
              status = excluded.status,
              joined_at = case
                when excluded.status = 'active' and tenant_members.joined_at is null then now()
                when excluded.status <> 'active' then tenant_members.joined_at
                else tenant_members.joined_at
              end
          returning id, tenant_id, user_id, role, status, joined_at, created_at
        `,
        [input.tenantId, input.userId, input.role, input.status]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Tenant member upsert did not return a row");
      }

      return mapMember(row);
    });
  }

  async updateTenantMemberStatus(input: {
    currentUserId: number;
    memberId: number;
    status: TenantMemberStatus;
  }): Promise<TenantMemberResponse> {
    return this.db.withTransaction(async (client) => {
      const existing = await client.query<TenantMemberRow>(
        `
          select id, tenant_id, user_id, role, status, joined_at, created_at
          from tenant_members
          where id = $1
          for update
        `,
        [input.memberId]
      );

      const member = existing.rows[0];
      if (!member) {
        throw new NotFoundError(`Tenant member not found: ${input.memberId}`);
      }

      await this.requireTenantAdmin(client, input.currentUserId, Number(member.tenant_id));
      const updated = await client.query<TenantMemberRow>(
        `
          update tenant_members
          set status = $2,
              joined_at = case
                when $2 = 'active' and joined_at is null then now()
                else joined_at
              end
          where id = $1
          returning id, tenant_id, user_id, role, status, joined_at, created_at
        `,
        [input.memberId, input.status]
      );

      const row = updated.rows[0];
      if (!row) {
        throw new NotFoundError(`Tenant member not found while updating: ${input.memberId}`);
      }

      return mapMember(row);
    });
  }

  private async requireTenantAdmin(
    client: DatabaseClient,
    userId: number,
    tenantId: number
  ): Promise<void> {
    const result = await client.query<{ role: TenantRole }>(
      `
        select role
        from tenant_members
        where tenant_id = $1
          and user_id = $2
          and status = 'active'
        limit 1
      `,
      [tenantId, userId]
    );

    const membership = result.rows[0];
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new ForbiddenError(`User ${userId} cannot manage tenant ${tenantId}`);
    }
  }
}

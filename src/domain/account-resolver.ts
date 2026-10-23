import type { DatabaseClient } from "../db/pool.js";
import { ForbiddenError, NotFoundError } from "./errors.js";

export type CreditAccount = {
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

type CreditAccountRow = {
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

function mapCreditAccount(row: CreditAccountRow): CreditAccount {
  return {
    id: Number(row.id),
    tenantId: row.tenant_id === null ? null : Number(row.tenant_id),
    userId: row.user_id === null ? null : Number(row.user_id),
    accountScope: row.account_scope,
    totalBalance: row.total_balance,
    lockedBalance: row.locked_balance,
    availableBalance: row.available_balance,
    currency: row.currency,
    status: row.status
  };
}

export class AccountResolver {
  constructor(private readonly db: DatabaseClient) {}

  async resolvePersonalAccount(userId: number): Promise<CreditAccount> {
    const result = await this.db.query<CreditAccountRow>(
      `
        select id, tenant_id, user_id, account_scope, total_balance, locked_balance,
               available_balance, currency, status
        from credit_accounts
        where account_scope = 'personal'
          and user_id = $1
          and tenant_id is null
          and status = 'active'
        order by id
        limit 1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Active personal credit account not found for user ${userId}`);
    }

    return mapCreditAccount(row);
  }

  async resolveTenantAccount(userId: number, tenantId: number): Promise<CreditAccount> {
    const membership = await this.db.query<{ id: string }>(
      `
        select id
        from tenant_members
        where tenant_id = $1
          and user_id = $2
          and status = 'active'
        limit 1
      `,
      [tenantId, userId]
    );

    if (!membership.rows[0]) {
      throw new ForbiddenError(`User ${userId} is not an active member of tenant ${tenantId}`);
    }

    const account = await this.db.query<CreditAccountRow>(
      `
        select id, tenant_id, user_id, account_scope, total_balance, locked_balance,
               available_balance, currency, status
        from credit_accounts
        where account_scope = 'tenant'
          and tenant_id = $1
          and user_id is null
          and status = 'active'
        order by id
        limit 1
      `,
      [tenantId]
    );

    const row = account.rows[0];
    if (!row) {
      throw new NotFoundError(`Active tenant credit account not found for tenant ${tenantId}`);
    }

    return mapCreditAccount(row);
  }
}

import type { Database, DatabaseClient } from "../db/pool.js";
import { comparePoints, subtractPoints, addPoints } from "./points.js";
import { InsufficientCreditsError, NotFoundError } from "./errors.js";

export type LockedAccount = {
  id: number;
  tenantId: number | null;
  userId: number | null;
  totalBalance: string;
  lockedBalance: string;
  availableBalance: string;
};

type LockedAccountRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  total_balance: string;
  locked_balance: string;
  available_balance: string;
};

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapLockedAccount(row: LockedAccountRow): LockedAccount {
  return {
    id: Number(row.id),
    tenantId: optionalNumber(row.tenant_id),
    userId: optionalNumber(row.user_id),
    totalBalance: row.total_balance,
    lockedBalance: row.locked_balance,
    availableBalance: row.available_balance
  };
}

export class BalanceService {
  constructor(private readonly db: Database) {}

  async withBalanceTransaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return this.db.withTransaction(fn);
  }

  async lockAccountForUpdate(accountId: number, client: DatabaseClient): Promise<LockedAccount> {
    const result = await client.query<LockedAccountRow>(
      `
        select id, tenant_id, user_id, total_balance, locked_balance, available_balance
        from credit_accounts
        where id = $1
          and status = 'active'
        for update
      `,
      [accountId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Active credit account not found: ${accountId}`);
    }

    return mapLockedAccount(row);
  }

  async increaseTotalBalance(input: {
    account: LockedAccount;
    points: string;
    client: DatabaseClient;
  }): Promise<LockedAccount> {
    const totalBalance = addPoints(input.account.totalBalance, input.points);

    return this.updateBalances(input.client, input.account.id, {
      totalBalance,
      lockedBalance: input.account.lockedBalance
    });
  }

  async freezeCredits(input: {
    account: LockedAccount;
    points: string;
    client: DatabaseClient;
  }): Promise<LockedAccount> {
    if (comparePoints(input.account.availableBalance, input.points) < 0) {
      throw new InsufficientCreditsError("Available balance is not enough to freeze credits");
    }

    const lockedBalance = addPoints(input.account.lockedBalance, input.points);

    return this.updateBalances(input.client, input.account.id, {
      totalBalance: input.account.totalBalance,
      lockedBalance
    });
  }

  async settleFrozenCredits(input: {
    account: LockedAccount;
    points: string;
    client: DatabaseClient;
  }): Promise<LockedAccount> {
    if (comparePoints(input.account.lockedBalance, input.points) < 0) {
      throw new InsufficientCreditsError("Locked balance is not enough to settle credits");
    }

    const totalBalance = subtractPoints(input.account.totalBalance, input.points);
    const lockedBalance = subtractPoints(input.account.lockedBalance, input.points);

    return this.updateBalances(input.client, input.account.id, {
      totalBalance,
      lockedBalance
    });
  }

  async releaseFrozenCredits(input: {
    account: LockedAccount;
    points: string;
    client: DatabaseClient;
  }): Promise<LockedAccount> {
    if (comparePoints(input.account.lockedBalance, input.points) < 0) {
      throw new InsufficientCreditsError("Locked balance is not enough to release credits");
    }

    const lockedBalance = subtractPoints(input.account.lockedBalance, input.points);

    return this.updateBalances(input.client, input.account.id, {
      totalBalance: input.account.totalBalance,
      lockedBalance
    });
  }

  private async updateBalances(
    client: DatabaseClient,
    accountId: number,
    balances: {
      totalBalance: string;
      lockedBalance: string;
    }
  ): Promise<LockedAccount> {
    const result = await client.query<LockedAccountRow>(
      `
        update credit_accounts
        set total_balance = $2,
            locked_balance = $3,
            updated_at = now()
        where id = $1
        returning id, tenant_id, user_id, total_balance, locked_balance, available_balance
      `,
      [accountId, balances.totalBalance, balances.lockedBalance]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Credit account not found while updating balance: ${accountId}`);
    }

    return mapLockedAccount(row);
  }
}

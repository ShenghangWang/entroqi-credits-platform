import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AgentApprovalService } from "../src/agent/agent-approval-service.js";
import { AgentService } from "../src/agent/agent-service.js";
import { BillingService } from "../src/billing/billing-service.js";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/pool.js";
import {
  ConflictError,
  ForbiddenError,
  InsufficientCreditsError
} from "../src/domain/index.js";
import { requestHash } from "../src/http/request-hash.js";
import { paymentSignature } from "../src/payment/payment-signature.js";
import { PaymentService } from "../src/payment/payment-service.js";

const env = {
  ...loadEnv(),
  nodeEnv: "test",
  logLevel: "silent"
};
const db = createDatabase(env);
const callbackSecret = "phase-8-secret";

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  const tables = [
    "agent_commissions",
    "agent_relations",
    "agent_profiles",
    "platform_admins",
    "credit_transactions",
    "payment_callbacks",
    "billing_locks",
    "billing_tasks",
    "payment_orders",
    "tenant_settlements",
    "idempotency_keys",
    "application_functions",
    "applications",
    "credit_accounts",
    "tenant_members",
    "recharge_products",
    "tenants",
    "users"
  ];

  await db.query("set foreign_key_checks = 0");
  try {
    for (const table of tables) {
      await db.query(`delete from ${table}`);
      await db.query(`alter table ${table} auto_increment = 1`);
    }
  } finally {
    await db.query("set foreign_key_checks = 1");
  }
});

type SeedUser = {
  id: number;
};

type SeedTenant = {
  id: number;
};

type SeedAccount = {
  id: number;
};

type SeedApplicationFunction = {
  applicationId: number;
  functionId: number;
};

type SeedProduct = {
  id: number;
};

async function createUser(label: string): Promise<SeedUser> {
  const result = await db.query<{ id: string }>(
    `
      insert into users (email, status)
      values ($1, 'active')
      returning id
    `,
    [`${label}@example.com`]
  );

  return { id: Number(result.rows[0]?.id) };
}

async function createTenant(label: string): Promise<SeedTenant> {
  const result = await db.query<{ id: string }>(
    `
      insert into tenants (name, type, status)
      values ($1, 'company', 'active')
      returning id
    `,
    [label]
  );

  return { id: Number(result.rows[0]?.id) };
}

async function addTenantMember(input: {
  tenantId: number;
  userId: number;
  role?: "owner" | "admin" | "employee";
}): Promise<void> {
  await db.query(
    `
      insert into tenant_members (tenant_id, user_id, role, status, joined_at)
      values ($1, $2, $3, 'active', now())
    `,
    [input.tenantId, input.userId, input.role ?? "employee"]
  );
}

async function createPersonalAccount(userId: number, totalBalance: string): Promise<SeedAccount> {
  const result = await db.query<{ id: string }>(
    `
      insert into credit_accounts (user_id, account_scope, total_balance, locked_balance)
      values ($1, 'personal', $2, 0)
      returning id
    `,
    [userId, totalBalance]
  );

  return { id: Number(result.rows[0]?.id) };
}

async function createTenantAccount(tenantId: number, totalBalance: string): Promise<SeedAccount> {
  const result = await db.query<{ id: string }>(
    `
      insert into credit_accounts (tenant_id, account_scope, total_balance, locked_balance)
      values ($1, 'tenant', $2, 0)
      returning id
    `,
    [tenantId, totalBalance]
  );

  return { id: Number(result.rows[0]?.id) };
}

async function createApplicationFunction(points: string): Promise<SeedApplicationFunction> {
  const application = await db.query<{ id: string }>(
    `
      insert into applications (code, name, status)
      values ('phase8_ai', 'Phase 8 AI', 'active')
      returning id
    `
  );
  const applicationId = Number(application.rows[0]?.id);
  const fn = await db.query<{ id: string }>(
    `
      insert into application_functions (
        application_id, code, name, charge_mode, default_points, status
      )
      values ($1, 'generate', 'Generate', 'estimate_required', $2, 'active')
      returning id
    `,
    [applicationId, points]
  );

  return {
    applicationId,
    functionId: Number(fn.rows[0]?.id)
  };
}

async function createRechargeProduct(input: {
  points: string;
  bonusPoints?: string;
  amount?: string;
}): Promise<SeedProduct> {
  const result = await db.query<{ id: string }>(
    `
      insert into recharge_products (
        name, amount, points, bonus_points, currency, sort, enabled
      )
      values ('Phase 8 Pack', $1, $2, $3, 'USD', 1, true)
      returning id
    `,
    [input.amount ?? "19.99", input.points, input.bonusPoints ?? "0"]
  );

  return { id: Number(result.rows[0]?.id) };
}

async function createPlatformAdmin(userId: number): Promise<void> {
  await db.query(
    `
      insert into platform_admins (user_id, role, status)
      values ($1, 'admin', 'active')
    `,
    [userId]
  );
}

async function accountBalances(accountId: number): Promise<{
  totalBalance: string;
  lockedBalance: string;
  availableBalance: string;
}> {
  const result = await db.query<{
    total_balance: string;
    locked_balance: string;
    available_balance: string;
  }>(
    `
      select total_balance, locked_balance, available_balance
      from credit_accounts
      where id = $1
    `,
    [accountId]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Account not found: ${accountId}`);

  return {
    totalBalance: row.total_balance,
    lockedBalance: row.locked_balance,
    availableBalance: row.available_balance
  };
}

async function transactionTypes(whereSql = "true"): Promise<string[]> {
  const result = await db.query<{ txn_type: string }>(
    `
      select txn_type
      from credit_transactions
      where ${whereSql}
      order by id asc
    `
  );

  return result.rows.map((row) => row.txn_type);
}

async function countRows(tableName: string, whereSql = "true"): Promise<number> {
  const result = await db.query<{ count: string }>(
    `
      select count(*) as count
      from ${tableName}
      where ${whereSql}
    `
  );

  return Number(result.rows[0]?.count);
}

async function estimate(input: {
  userId: number;
  tenantId?: number;
  accountScope?: "personal" | "tenant";
  key: string;
  bizId: string;
}): Promise<{ billingTaskId: number; status: string; idempotentReplay: boolean }> {
  const payload: {
    userId: number;
    accountScope: "personal" | "tenant";
    tenantId?: number;
    applicationCode: string;
    functionCode: string;
    bizType: string;
    bizId: string;
  } = {
    userId: input.userId,
    accountScope: input.accountScope ?? "personal",
    applicationCode: "phase8_ai",
    functionCode: "generate",
    bizType: "phase8_task",
    bizId: input.bizId
  };
  if (input.tenantId !== undefined) payload.tenantId = input.tenantId;

  return new BillingService(db).estimate({
    ...payload,
    idempotencyKey: input.key,
    requestHash: requestHash(payload)
  }) as Promise<{ billingTaskId: number; status: string; idempotentReplay: boolean }>;
}

async function freeze(userId: number, billingTaskId: number, key: string) {
  const payload = { userId, billingTaskId };

  return new BillingService(db).freeze({
    ...payload,
    idempotencyKey: key,
    requestHash: requestHash(payload)
  });
}

async function settle(userId: number, billingTaskId: number, key: string) {
  const payload = { userId, billingTaskId };

  return new BillingService(db).settle({
    ...payload,
    idempotencyKey: key,
    requestHash: requestHash(payload)
  });
}

async function refund(userId: number, billingTaskId: number, key: string) {
  const payload = { userId, billingTaskId };

  return new BillingService(db).refund({
    ...payload,
    idempotencyKey: key,
    requestHash: requestHash(payload)
  });
}

async function paidCallback(input: {
  payment: PaymentService;
  orderNo: string;
  notifyId: string;
}) {
  const rawData = { orderNo: input.orderNo, status: "paid", notifyId: input.notifyId };
  const callback = {
    channel: "card" as const,
    orderNo: input.orderNo,
    notifyId: input.notifyId,
    providerStatus: "paid" as const,
    rawData,
    sign: paymentSignature(rawData, callbackSecret)
  };

  return input.payment.processCallback({
    ...callback,
    requestHash: input.payment.callbackRequestHash(callback)
  });
}

describe("phase 8 testing matrix", () => {
  it("recharges a personal account and writes recharge plus bonus ledger rows", async () => {
    const user = await createUser("personal-recharge");
    const account = await createPersonalAccount(user.id, "0");
    const product = await createRechargeProduct({ points: "100.0000", bonusPoints: "10.0000" });
    const payment = new PaymentService(db, callbackSecret);
    const order = (await payment.createPaymentOrder({
      userId: user.id,
      accountScope: "personal",
      productId: product.id,
      payChannel: "card",
      idempotencyKey: "personal-order",
      requestHash: "personal-order-hash"
    })) as { orderNo: string };

    await expect(
      paidCallback({
        payment,
        orderNo: order.orderNo,
        notifyId: "notify-personal-1"
      })
    ).resolves.toMatchObject({
      status: "paid",
      credited: true
    });
    await expect(accountBalances(account.id)).resolves.toEqual({
      totalBalance: "110.0000",
      lockedBalance: "0.0000",
      availableBalance: "110.0000"
    });
    await expect(transactionTypes()).resolves.toEqual(["recharge", "bonus"]);
  });

  it("recharges a tenant account through an active tenant member", async () => {
    const user = await createUser("tenant-recharge-user");
    const tenant = await createTenant("tenant-recharge");
    await addTenantMember({ tenantId: tenant.id, userId: user.id, role: "admin" });
    const account = await createTenantAccount(tenant.id, "5.0000");
    const product = await createRechargeProduct({ points: "50.0000" });
    const payment = new PaymentService(db, callbackSecret);
    const order = (await payment.createPaymentOrder({
      userId: user.id,
      accountScope: "tenant",
      tenantId: tenant.id,
      productId: product.id,
      payChannel: "card",
      idempotencyKey: "tenant-order",
      requestHash: "tenant-order-hash"
    })) as { orderNo: string };

    await paidCallback({
      payment,
      orderNo: order.orderNo,
      notifyId: "notify-tenant-1"
    });

    await expect(accountBalances(account.id)).resolves.toMatchObject({
      totalBalance: "55.0000",
      lockedBalance: "0.0000"
    });
    await expect(transactionTypes("tenant_id is not null")).resolves.toEqual(["recharge"]);
  });

  it("replays duplicate payment callbacks without duplicate credits", async () => {
    const user = await createUser("duplicate-callback");
    await createPersonalAccount(user.id, "0");
    const product = await createRechargeProduct({ points: "20.0000", bonusPoints: "5.0000" });
    const payment = new PaymentService(db, callbackSecret);
    const order = (await payment.createPaymentOrder({
      userId: user.id,
      accountScope: "personal",
      productId: product.id,
      payChannel: "card",
      idempotencyKey: "duplicate-order",
      requestHash: "duplicate-order-hash"
    })) as { orderNo: string };
    const orderNo = order.orderNo;

    await paidCallback({ payment, orderNo, notifyId: "notify-duplicate-1" });
    await expect(
      paidCallback({ payment, orderNo, notifyId: "notify-duplicate-1" })
    ).resolves.toMatchObject({
      idempotentReplay: true,
      credited: true
    });

    await expect(countRows("payment_callbacks")).resolves.toBe(1);
    await expect(transactionTypes()).resolves.toEqual(["recharge", "bonus"]);
  });

  it("freezes and settles personal usage", async () => {
    const user = await createUser("personal-settle");
    const account = await createPersonalAccount(user.id, "50.0000");
    await createApplicationFunction("12.0000");
    const task = await estimate({ userId: user.id, key: "estimate-settle", bizId: "settle-1" });

    await expect(freeze(user.id, task.billingTaskId, "freeze-settle")).resolves.toMatchObject({
      status: "frozen"
    });
    await expect(settle(user.id, task.billingTaskId, "settle-settle")).resolves.toMatchObject({
      status: "settled"
    });

    await expect(accountBalances(account.id)).resolves.toEqual({
      totalBalance: "38.0000",
      lockedBalance: "0.0000",
      availableBalance: "38.0000"
    });
    await expect(transactionTypes()).resolves.toEqual(["estimate", "freeze", "settle"]);
  });

  it("freezes and refunds personal usage", async () => {
    const user = await createUser("personal-refund");
    const account = await createPersonalAccount(user.id, "50.0000");
    await createApplicationFunction("12.0000");
    const task = await estimate({ userId: user.id, key: "estimate-refund", bizId: "refund-1" });

    await freeze(user.id, task.billingTaskId, "freeze-refund");
    await expect(refund(user.id, task.billingTaskId, "refund-refund")).resolves.toMatchObject({
      status: "refunded"
    });

    await expect(accountBalances(account.id)).resolves.toEqual({
      totalBalance: "50.0000",
      lockedBalance: "0.0000",
      availableBalance: "50.0000"
    });
    await expect(transactionTypes()).resolves.toEqual(["estimate", "freeze", "refund"]);
  });

  it("freezes and settles tenant employee usage against the tenant account", async () => {
    const employee = await createUser("tenant-employee");
    const tenant = await createTenant("tenant-usage");
    await addTenantMember({ tenantId: tenant.id, userId: employee.id });
    const account = await createTenantAccount(tenant.id, "40.0000");
    await createApplicationFunction("15.0000");
    const task = await estimate({
      userId: employee.id,
      tenantId: tenant.id,
      accountScope: "tenant",
      key: "tenant-estimate",
      bizId: "tenant-usage-1"
    });

    await freeze(employee.id, task.billingTaskId, "tenant-freeze");
    await settle(employee.id, task.billingTaskId, "tenant-settle");

    await expect(accountBalances(account.id)).resolves.toMatchObject({
      totalBalance: "25.0000",
      lockedBalance: "0.0000"
    });
    await expect(transactionTypes("tenant_id is not null")).resolves.toEqual([
      "estimate",
      "freeze",
      "settle"
    ]);
  });

  it("rejects tenant usage when the user is not an active tenant member", async () => {
    const user = await createUser("invalid-tenant-member");
    const tenant = await createTenant("invalid-tenant");
    await createTenantAccount(tenant.id, "40.0000");
    await createApplicationFunction("15.0000");

    await expect(
      estimate({
        userId: user.id,
        tenantId: tenant.id,
        accountScope: "tenant",
        key: "invalid-tenant-estimate",
        bizId: "invalid-tenant-1"
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects insufficient balance during freeze", async () => {
    const user = await createUser("insufficient-balance");
    await createPersonalAccount(user.id, "5.0000");
    await createApplicationFunction("12.0000");
    const task = await estimate({ userId: user.id, key: "insufficient-estimate", bizId: "low-1" });

    await expect(freeze(user.id, task.billingTaskId, "insufficient-freeze")).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
  });

  it("prevents concurrent freezes from overspending one account", async () => {
    const user = await createUser("concurrent-freeze");
    const account = await createPersonalAccount(user.id, "10.0000");
    await createApplicationFunction("8.0000");
    const first = await estimate({ userId: user.id, key: "concurrent-estimate-1", bizId: "c1" });
    const second = await estimate({ userId: user.id, key: "concurrent-estimate-2", bizId: "c2" });

    const results = await Promise.allSettled([
      freeze(user.id, first.billingTaskId, "concurrent-freeze-1"),
      freeze(user.id, second.billingTaskId, "concurrent-freeze-2")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(accountBalances(account.id)).resolves.toEqual({
      totalBalance: "10.0000",
      lockedBalance: "8.0000",
      availableBalance: "2.0000"
    });
    await expect(countRows("billing_locks", "status = 'active'")).resolves.toBe(1);
  });

  it("returns cached responses for identical idempotency keys and hashes", async () => {
    const user = await createUser("idempotency-replay");
    await createPersonalAccount(user.id, "50.0000");
    await createApplicationFunction("12.0000");
    const first = await estimate({ userId: user.id, key: "same-estimate", bizId: "same-body" });
    const second = await estimate({ userId: user.id, key: "same-estimate", bizId: "same-body" });

    expect(first.idempotentReplay).toBe(false);
    expect(second).toMatchObject({
      billingTaskId: first.billingTaskId,
      idempotentReplay: true
    });
    await expect(countRows("billing_tasks")).resolves.toBe(1);
  });

  it("rejects reused idempotency keys with different request hashes", async () => {
    const user = await createUser("idempotency-conflict");
    await createPersonalAccount(user.id, "50.0000");
    await createApplicationFunction("12.0000");
    await estimate({ userId: user.id, key: "conflict-estimate", bizId: "body-1" });

    await expect(
      estimate({ userId: user.id, key: "conflict-estimate", bizId: "body-2" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps ledger rows immutable by recording corrections as new adjustment rows", async () => {
    const user = await createUser("ledger-immutable");
    const account = await createPersonalAccount(user.id, "10.0000");
    const original = await db.query<{ id: string; points: string; remark: string }>(
      `
        insert into credit_transactions (
          user_id, account_id, txn_type, points, balance_before, balance_after, remark
        )
        values ($1, $2, 'grant', 10, 0, 10, 'original grant')
        returning id, points, remark
      `,
      [user.id, account.id]
    );
    const originalId = Number(original.rows[0]?.id);

    await db.query(
      `
        insert into credit_transactions (
          user_id, account_id, txn_type, points, balance_before, balance_after,
          ref_txn_id, remark
        )
        values ($1, $2, 'adjustment', -2, 10, 8, $3, 'correction adjustment')
      `,
      [user.id, account.id, originalId]
    );

    const after = await db.query<{ id: string; points: string; remark: string }>(
      `
        select id, points, remark
        from credit_transactions
        where id = $1
      `,
      [originalId]
    );
    const mutableColumns = await db.query<{ column_name: string }>(
      `
        select column_name as column_name
        from information_schema.columns
        where table_schema = database()
          and table_name = 'credit_transactions'
          and column_name = 'updated_at'
      `
    );

    expect(after.rows[0]).toEqual(original.rows[0]);
    expect(mutableColumns.rows).toHaveLength(0);
    await expect(transactionTypes()).resolves.toEqual(["grant", "adjustment"]);
  });

  it("requires platform approval for agent relations, commission generation, and settlement", async () => {
    const admin = await createUser("platform-admin");
    const agent = await createUser("approved-agent");
    const referred = await createUser("referred-user");
    await createPlatformAdmin(admin.id);
    await createPersonalAccount(agent.id, "0.0000");
    await createPersonalAccount(referred.id, "50.0000");
    await createApplicationFunction("20.0000");
    const approvals = new AgentApprovalService(db);
    const agents = new AgentService(db);

    await expect(
      agents.createRelation({
        agentUserId: agent.id,
        referredUserId: referred.id,
        relationType: "direct",
        commissionRate: "0.1000"
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await approvals.applyForAgent(agent.id);
    await approvals.approveAgent({ currentUserId: admin.id, userId: agent.id });
    const relation = await agents.createRelation({
      agentUserId: agent.id,
      referredUserId: referred.id,
      relationType: "direct",
      commissionRate: "0.1000"
    });
    expect(relation.status).toBe("active");

    const task = await estimate({ userId: referred.id, key: "agent-estimate", bizId: "agent-1" });
    await freeze(referred.id, task.billingTaskId, "agent-freeze");
    await settle(referred.id, task.billingTaskId, "agent-settle");
    const source = await db.query<{ id: string }>(
      `
        select id
        from credit_transactions
        where txn_type = 'settle'
        limit 1
      `
    );
    const generated = await agents.generateFromSourceTransaction(Number(source.rows[0]?.id));
    expect(generated.commissions).toHaveLength(1);
    expect(generated.commissions[0]).toMatchObject({
      agentUserId: agent.id,
      referredUserId: referred.id,
      commissionPoints: "2.0000",
      status: "pending"
    });

    await approvals.suspendAgent({ currentUserId: admin.id, userId: agent.id });
    await expect(
      agents.settleCommission({
        commissionId: generated.commissions[0]?.id ?? 0,
        idempotencyKey: "agent-commission-settle",
        requestHash: "agent-commission-settle-hash"
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const laterTask = await estimate({
      userId: referred.id,
      key: "agent-estimate-after-suspend",
      bizId: "agent-2"
    });
    await freeze(referred.id, laterTask.billingTaskId, "agent-freeze-after-suspend");
    await settle(referred.id, laterTask.billingTaskId, "agent-settle-after-suspend");
    const laterSource = await db.query<{ id: string }>(
      `
        select id
        from credit_transactions
        where txn_type = 'settle'
        order by id desc
        limit 1
      `
    );

    await expect(
      agents.generateFromSourceTransaction(Number(laterSource.rows[0]?.id))
    ).resolves.toMatchObject({
      commissions: []
    });
    await expect(transactionTypes("user_id = " + agent.id)).resolves.toEqual([]);
  });

  it("settles approved agent commissions as commission_grant ledger rows", async () => {
    const admin = await createUser("commission-admin");
    const agent = await createUser("commission-agent");
    const referred = await createUser("commission-referred");
    await createPlatformAdmin(admin.id);
    const agentAccount = await createPersonalAccount(agent.id, "0.0000");
    await createPersonalAccount(referred.id, "50.0000");
    await createApplicationFunction("20.0000");
    const approvals = new AgentApprovalService(db);
    const agents = new AgentService(db);
    await approvals.applyForAgent(agent.id);
    await approvals.approveAgent({ currentUserId: admin.id, userId: agent.id });
    await agents.createRelation({
      agentUserId: agent.id,
      referredUserId: referred.id,
      relationType: "direct",
      commissionRate: "0.1000"
    });

    const task = await estimate({ userId: referred.id, key: "grant-estimate", bizId: "grant-1" });
    await freeze(referred.id, task.billingTaskId, "grant-freeze");
    await settle(referred.id, task.billingTaskId, "grant-settle");
    const source = await db.query<{ id: string }>(
      "select id from credit_transactions where txn_type = 'settle' limit 1"
    );
    const generated = await agents.generateFromSourceTransaction(Number(source.rows[0]?.id));
    await expect(
      agents.settleCommission({
        commissionId: generated.commissions[0]?.id ?? 0,
        idempotencyKey: "grant-commission",
        requestHash: "grant-commission-hash"
      })
    ).resolves.toMatchObject({
      status: "settled",
      commissionPoints: "2.0000"
    });

    await expect(accountBalances(agentAccount.id)).resolves.toMatchObject({
      totalBalance: "2.0000"
    });
    await expect(transactionTypes("user_id = " + agent.id)).resolves.toEqual(["commission_grant"]);
  });
});

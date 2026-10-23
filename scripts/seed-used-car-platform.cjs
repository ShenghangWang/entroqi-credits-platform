const mysql = require("mysql2/promise");

const APPLICATION = {
  code: "used-car-platform",
  name: "Used Car Platform",
  description: "Vehicle image generation workflows integrated through usedCarPlatform."
};

const FUNCTIONS = [
  {
    code: "showroom-light",
    name: "Showroom Light",
    description: "Generate showroom lighting for one exterior vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "outdoor-scene",
    name: "Outdoor Scene",
    description: "Generate an outdoor scene for one exterior vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "road-motion",
    name: "Road Motion",
    description: "Generate road motion for one exterior vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "sky-studio",
    name: "Sky Studio",
    description: "Generate sky studio styling for one exterior vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "paint-refresh",
    name: "Paint Refresh",
    description: "Generate paint refresh output for one vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "light-consistency",
    name: "Light Consistency",
    description: "Normalize light consistency for one vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "interior-clean",
    name: "Interior Clean",
    description: "Generate an interior clean-up output for one vehicle interior image.",
    defaultPoints: "30.0000"
  },
  {
    code: "interior-collage",
    name: "Interior Collage",
    description: "Generate one interior collage output from a group of vehicle interior images.",
    defaultPoints: "30.0000"
  },
  {
    code: "watermark-remove",
    name: "Watermark Remove",
    description: "Remove watermark artifacts from one vehicle image.",
    defaultPoints: "30.0000"
  },
  {
    code: "batch-new-exterior",
    name: "Batch New Exterior Item",
    description: "Generate one exterior item inside a batch-new workflow.",
    defaultPoints: "30.0000"
  },
  {
    code: "batch-new-interior",
    name: "Batch New Interior Item",
    description: "Generate one interior item inside a batch-new workflow.",
    defaultPoints: "30.0000"
  }
];

const RECHARGE_PRODUCTS = [
  {
    name: "积分充值 100 元",
    amount: "100.00",
    points: "10000.0000",
    bonusPoints: "0.0000",
    currency: "CNY",
    sort: 10
  },
  {
    name: "积分充值 200 元",
    amount: "200.00",
    points: "20000.0000",
    bonusPoints: "0.0000",
    currency: "CNY",
    sort: 20
  },
  {
    name: "积分充值 500 元",
    amount: "500.00",
    points: "50000.0000",
    bonusPoints: "0.0000",
    currency: "CNY",
    sort: 30
  },
  {
    name: "积分充值 1000 元",
    amount: "1000.00",
    points: "100000.0000",
    bonusPoints: "0.0000",
    currency: "CNY",
    sort: 40
  },
  {
    name: "积分充值 2000 元",
    amount: "2000.00",
    points: "200000.0000",
    bonusPoints: "0.0000",
    currency: "CNY",
    sort: 50
  }
];

const DEMO = {
  username: "used_car_demo",
  email: "used-car-demo@example.com",
  tenantName: "Used Car Demo Tenant",
  startingBalance: "1250.0000"
};

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || "credits_platform",
    user: process.env.MYSQL_USER || "credits",
    password: process.env.MYSQL_PASSWORD || "credits",
    multipleStatements: false
  };
}

async function selectOne(client, sql, values = []) {
  const [rows] = await client.execute(sql, values);
  return rows[0] ?? null;
}

async function upsertApplication(client) {
  const [result] = await client.execute(
    `
      insert into applications (code, name, description, status)
      values (?, ?, ?, 'active')
      on duplicate key update
        id = LAST_INSERT_ID(id),
        name = values(name),
        description = values(description),
        status = values(status),
        updated_at = CURRENT_TIMESTAMP
    `,
    [APPLICATION.code, APPLICATION.name, APPLICATION.description]
  );

  return selectOne(client, "select id, code from applications where id = ? limit 1", [result.insertId]);
}

async function upsertFunctions(client, applicationId) {
  const seeded = [];

  for (const item of FUNCTIONS) {
    const [result] = await client.execute(
      `
        insert into application_functions (
          application_id, code, name, description, charge_mode, default_points, status
        )
        values (?, ?, ?, ?, 'fixed', ?, 'active')
        on duplicate key update
          id = LAST_INSERT_ID(id),
          name = values(name),
          description = values(description),
          charge_mode = values(charge_mode),
          default_points = values(default_points),
          status = values(status),
          updated_at = CURRENT_TIMESTAMP
      `,
      [applicationId, item.code, item.name, item.description, item.defaultPoints]
    );

    seeded.push(
      await selectOne(
        client,
        "select id, code, default_points from application_functions where id = ? limit 1",
        [result.insertId]
      )
    );
  }

  return seeded;
}

async function upsertRechargeProducts(client) {
  const seeded = [];
  const activeNames = RECHARGE_PRODUCTS.map((product) => product.name);
  await client.execute(
    `
      update recharge_products
      set enabled = false,
          updated_at = CURRENT_TIMESTAMP
      where name not in (${activeNames.map(() => "?").join(", ")})
    `,
    activeNames
  );

  for (const product of RECHARGE_PRODUCTS) {
    const existing = await selectOne(
      client,
      `
        select id
        from recharge_products
        where name = ?
        limit 1
      `,
      [product.name]
    );

    if (existing) {
      await client.execute(
        `
          update recharge_products
          set amount = ?,
              points = ?,
              bonus_points = ?,
              currency = ?,
              sort = ?,
              enabled = true,
              updated_at = CURRENT_TIMESTAMP
          where id = ?
        `,
        [
          product.amount,
          product.points,
          product.bonusPoints,
          product.currency,
          product.sort,
          existing.id
        ]
      );
      seeded.push(
        await selectOne(client, "select id, name, amount, points from recharge_products where id = ?", [
          existing.id
        ])
      );
      continue;
    }

    const [result] = await client.execute(
      `
        insert into recharge_products (
          name, amount, points, bonus_points, currency, sort, enabled
        )
        values (?, ?, ?, ?, ?, ?, true)
      `,
      [
        product.name,
        product.amount,
        product.points,
        product.bonusPoints,
        product.currency,
        product.sort
      ]
    );
    seeded.push(
      await selectOne(client, "select id, name, amount, points from recharge_products where id = ?", [
        result.insertId
      ])
    );
  }

  return seeded;
}

async function ensureDemoUser(client) {
  const [userInsert] = await client.execute(
    `
      insert into users (username, email, status)
      values (?, ?, 'active')
      on duplicate key update
        id = LAST_INSERT_ID(id),
        username = values(username),
        email = values(email),
        status = values(status),
        updated_at = CURRENT_TIMESTAMP
    `,
    [DEMO.username, DEMO.email]
  );
  const user = await selectOne(client, "select id, username, email from users where id = ? limit 1", [
    userInsert.insertId
  ]);

  const personalAccount = await findOrCreateCreditAccount(client, {
    userId: user.id,
    tenantId: null,
    accountScope: "personal"
  });

  const tenant = await findOrCreateDemoTenant(client);

  await client.execute(
    `
      insert into tenant_members (tenant_id, user_id, role, status, joined_at)
      values (?, ?, 'owner', 'active', CURRENT_TIMESTAMP)
      on duplicate key update
        role = values(role),
        status = values(status),
        joined_at = coalesce(tenant_members.joined_at, values(joined_at))
    `,
    [tenant.id, user.id]
  );

  const tenantAccount = await findOrCreateCreditAccount(client, {
    userId: null,
    tenantId: tenant.id,
    accountScope: "tenant"
  });

  return {
    user,
    tenant,
    personalAccount,
    tenantAccount
  };
}

async function findOrCreateDemoTenant(client) {
  const existing = await selectOne(
    client,
    `
      select id, name
      from tenants
      where name = ?
        and type = 'demo'
      order by id
      limit 1
    `,
    [DEMO.tenantName]
  );

  if (existing) return existing;

  const [created] = await client.execute(
    `
      insert into tenants (name, type, status)
      values (?, 'demo', 'active')
    `,
    [DEMO.tenantName]
  );

  return selectOne(client, "select id, name from tenants where id = ? limit 1", [created.insertId]);
}

async function findOrCreateCreditAccount(client, input) {
  const existing = await selectOne(
    client,
    `
      select id, total_balance, locked_balance, available_balance
      from credit_accounts
      where account_scope = ?
        and ((? is null and user_id is null) or user_id = ?)
        and ((? is null and tenant_id is null) or tenant_id = ?)
        and status = 'active'
      order by id
      limit 1
    `,
    [input.accountScope, input.userId, input.userId, input.tenantId, input.tenantId]
  );

  if (existing) return existing;

  const [created] = await client.execute(
    `
      insert into credit_accounts (
        tenant_id, user_id, account_scope, total_balance, locked_balance, currency, status
      )
      values (?, ?, ?, ?, 0, 'credits', 'active')
    `,
    [input.tenantId, input.userId, input.accountScope, DEMO.startingBalance]
  );

  return selectOne(
    client,
    "select id, total_balance, locked_balance, available_balance from credit_accounts where id = ? limit 1",
    [created.insertId]
  );
}

async function main() {
  const withDemoAccount =
    process.argv.includes("--with-demo-account") ||
    process.env.USED_CAR_SEED_DEMO_ACCOUNT === "true";

  const client = await mysql.createConnection(mysqlConfig());

  try {
    await client.beginTransaction();

    const application = await upsertApplication(client);
    const functions = await upsertFunctions(client, application.id);
    const products = await upsertRechargeProducts(client);
    const demo = withDemoAccount ? await ensureDemoUser(client) : null;

    await client.commit();

    console.log(`Application ready: ${application.code} (${application.id})`);
    console.log(`Functions ready: ${functions.length}`);
    console.log(`Recharge products ready: ${products.length}`);

    if (demo) {
      console.log(`Demo user ready: ${demo.user.email} (${demo.user.id})`);
      console.log(`Demo personal account: ${demo.personalAccount.id}`);
      console.log(`Demo tenant account: ${demo.tenantAccount.id}`);
    }
  } catch (error) {
    await client.rollback();
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  APPLICATION,
  FUNCTIONS,
  RECHARGE_PRODUCTS,
  DEMO
};

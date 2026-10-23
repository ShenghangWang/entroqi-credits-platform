require("dotenv/config");

const mysql = require("mysql2/promise");

const MIGRATIONS = [
  {
    name: "000001_phase_0_foundation",
    statements: ["SELECT 1"]
  },
  {
    name: "000002_phase_1_core_schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(320) NULL UNIQUE,
        phone VARCHAR(32) NULL UNIQUE,
        password_hash VARCHAR(255) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )`,
      `CREATE TABLE IF NOT EXISTS tenants (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX tenants_type_idx (type),
        INDEX tenants_status_idx (status)
      )`,
      `CREATE TABLE IF NOT EXISTS applications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX applications_status_idx (status)
      )`,
      `CREATE TABLE IF NOT EXISTS recharge_products (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        amount DECIMAL(18, 2) NOT NULL,
        points DECIMAL(18, 4) NOT NULL,
        bonus_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        currency VARCHAR(16) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT recharge_products_amount_nonnegative_ck CHECK (amount >= 0),
        CONSTRAINT recharge_products_points_nonnegative_ck CHECK (points >= 0),
        CONSTRAINT recharge_products_bonus_points_nonnegative_ck CHECK (bonus_points >= 0),
        INDEX recharge_products_enabled_sort_idx (enabled, sort)
      )`,
      `CREATE TABLE IF NOT EXISTS tenant_members (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        role ENUM('owner', 'admin', 'employee') NOT NULL,
        status ENUM('active', 'disabled', 'invited') NOT NULL DEFAULT 'invited',
        joined_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT tenant_members_tenant_user_unique UNIQUE (tenant_id, user_id),
        CONSTRAINT tenant_members_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT tenant_members_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        INDEX tenant_members_tenant_id_idx (tenant_id),
        INDEX tenant_members_user_id_idx (user_id),
        INDEX tenant_members_role_idx (role),
        INDEX tenant_members_status_idx (status)
      )`,
      `CREATE TABLE IF NOT EXISTS credit_accounts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NULL,
        user_id BIGINT NULL,
        account_scope ENUM('personal', 'tenant') NOT NULL,
        total_balance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        locked_balance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        available_balance DECIMAL(18, 4) GENERATED ALWAYS AS (total_balance - locked_balance) STORED,
        currency VARCHAR(16) NOT NULL DEFAULT 'credits',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT credit_accounts_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT credit_accounts_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT credit_accounts_scope_owner_ck CHECK (
          (account_scope = 'personal' AND user_id IS NOT NULL AND tenant_id IS NULL)
          OR
          (account_scope = 'tenant' AND tenant_id IS NOT NULL AND user_id IS NULL)
        ),
        CONSTRAINT credit_accounts_total_balance_nonnegative_ck CHECK (total_balance >= 0),
        CONSTRAINT credit_accounts_locked_balance_nonnegative_ck CHECK (locked_balance >= 0),
        CONSTRAINT credit_accounts_locked_not_above_total_ck CHECK (locked_balance <= total_balance),
        INDEX credit_accounts_tenant_id_idx (tenant_id),
        INDEX credit_accounts_user_id_idx (user_id),
        INDEX credit_accounts_scope_status_idx (account_scope, status)
      )`,
      `CREATE TABLE IF NOT EXISTS application_functions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        application_id BIGINT NOT NULL,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        charge_mode ENUM('fixed', 'dynamic', 'estimate_required') NOT NULL,
        default_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT application_functions_application_fk FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE RESTRICT,
        CONSTRAINT application_functions_application_code_unique UNIQUE (application_id, code),
        CONSTRAINT application_functions_default_points_nonnegative_ck CHECK (default_points >= 0),
        INDEX application_functions_application_id_idx (application_id),
        INDEX application_functions_status_idx (status)
      )`,
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        request_hash VARCHAR(128) NOT NULL,
        response_body JSON NULL,
        status VARCHAR(32) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        expires_at TIMESTAMP(3) NOT NULL,
        CONSTRAINT idempotency_keys_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT idempotency_keys_user_key_unique UNIQUE (user_id, idempotency_key),
        INDEX idempotency_keys_user_id_idx (user_id),
        INDEX idempotency_keys_expires_at_idx (expires_at)
      )`,
      `CREATE TABLE IF NOT EXISTS tenant_settlements (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        period VARCHAR(64) NOT NULL,
        total_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        total_amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT tenant_settlements_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        INDEX tenant_settlements_tenant_id_idx (tenant_id),
        INDEX tenant_settlements_period_idx (period)
      )`,
      `CREATE TABLE IF NOT EXISTS payment_orders (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NULL,
        user_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        product_id BIGINT NOT NULL,
        order_no VARCHAR(100) NOT NULL UNIQUE,
        amount DECIMAL(18, 2) NOT NULL,
        points DECIMAL(18, 4) NOT NULL,
        bonus_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        pay_channel ENUM('alipay', 'wechat', 'card') NOT NULL,
        status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
        paid_at TIMESTAMP(3) NULL,
        notify_id VARCHAR(255) NULL,
        idempotency_key VARCHAR(255) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT payment_orders_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT payment_orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT payment_orders_account_fk FOREIGN KEY (account_id) REFERENCES credit_accounts (id) ON DELETE RESTRICT,
        CONSTRAINT payment_orders_product_fk FOREIGN KEY (product_id) REFERENCES recharge_products (id) ON DELETE RESTRICT,
        CONSTRAINT payment_orders_amount_nonnegative_ck CHECK (amount >= 0),
        CONSTRAINT payment_orders_points_nonnegative_ck CHECK (points >= 0),
        CONSTRAINT payment_orders_bonus_points_nonnegative_ck CHECK (bonus_points >= 0),
        INDEX payment_orders_tenant_id_idx (tenant_id),
        INDEX payment_orders_user_id_idx (user_id),
        INDEX payment_orders_account_id_idx (account_id),
        INDEX payment_orders_product_id_idx (product_id),
        INDEX payment_orders_status_idx (status),
        INDEX payment_orders_notify_id_idx (notify_id),
        INDEX payment_orders_idempotency_key_idx (idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS billing_tasks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NULL,
        user_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        application_id BIGINT NOT NULL,
        function_id BIGINT NOT NULL,
        biz_type VARCHAR(100) NOT NULL,
        biz_id VARCHAR(255) NOT NULL,
        estimated_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        frozen_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        settled_points DECIMAL(18, 4) NOT NULL DEFAULT 0,
        status ENUM('estimated', 'frozen', 'settled', 'refunded', 'failed', 'cancelled') NOT NULL DEFAULT 'estimated',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT billing_tasks_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT billing_tasks_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT billing_tasks_account_fk FOREIGN KEY (account_id) REFERENCES credit_accounts (id) ON DELETE RESTRICT,
        CONSTRAINT billing_tasks_application_fk FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE RESTRICT,
        CONSTRAINT billing_tasks_function_fk FOREIGN KEY (function_id) REFERENCES application_functions (id) ON DELETE RESTRICT,
        CONSTRAINT billing_tasks_estimated_points_nonnegative_ck CHECK (estimated_points >= 0),
        CONSTRAINT billing_tasks_frozen_points_nonnegative_ck CHECK (frozen_points >= 0),
        CONSTRAINT billing_tasks_settled_points_nonnegative_ck CHECK (settled_points >= 0),
        INDEX billing_tasks_tenant_id_idx (tenant_id),
        INDEX billing_tasks_user_id_idx (user_id),
        INDEX billing_tasks_account_id_idx (account_id),
        INDEX billing_tasks_application_id_idx (application_id),
        INDEX billing_tasks_function_id_idx (function_id),
        INDEX billing_tasks_biz_ref_idx (biz_type, biz_id),
        INDEX billing_tasks_status_idx (status)
      )`,
      `CREATE TABLE IF NOT EXISTS billing_locks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        billing_task_id BIGINT NOT NULL,
        tenant_id BIGINT NULL,
        user_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        lock_type ENUM('freeze', 'settle') NOT NULL,
        points DECIMAL(18, 4) NOT NULL,
        status ENUM('active', 'released', 'expired') NOT NULL DEFAULT 'active',
        expire_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT billing_locks_billing_task_fk FOREIGN KEY (billing_task_id) REFERENCES billing_tasks (id) ON DELETE RESTRICT,
        CONSTRAINT billing_locks_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT billing_locks_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT billing_locks_account_fk FOREIGN KEY (account_id) REFERENCES credit_accounts (id) ON DELETE RESTRICT,
        CONSTRAINT billing_locks_billing_task_unique UNIQUE (billing_task_id),
        CONSTRAINT billing_locks_points_positive_ck CHECK (points > 0),
        INDEX billing_locks_tenant_id_idx (tenant_id),
        INDEX billing_locks_user_id_idx (user_id),
        INDEX billing_locks_account_id_idx (account_id),
        INDEX billing_locks_status_idx (status),
        INDEX billing_locks_expire_at_idx (expire_at)
      )`,
      `CREATE TABLE IF NOT EXISTS payment_callbacks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        payment_order_id BIGINT NOT NULL,
        callback_type VARCHAR(64) NOT NULL,
        notify_id VARCHAR(255) NULL,
        raw_data JSON NOT NULL,
        sign VARCHAR(512) NULL,
        status VARCHAR(32) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT payment_callbacks_payment_order_fk FOREIGN KEY (payment_order_id) REFERENCES payment_orders (id) ON DELETE RESTRICT,
        INDEX payment_callbacks_payment_order_id_idx (payment_order_id),
        INDEX payment_callbacks_notify_id_idx (notify_id)
      )`,
      `CREATE TABLE IF NOT EXISTS credit_transactions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NULL,
        user_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        billing_task_id BIGINT NULL,
        payment_order_id BIGINT NULL,
        application_id BIGINT NULL,
        function_id BIGINT NULL,
        txn_type ENUM('estimate', 'freeze', 'settle', 'refund', 'grant', 'recharge', 'bonus', 'adjustment', 'commission_grant') NOT NULL,
        points DECIMAL(18, 4) NOT NULL,
        balance_before DECIMAL(18, 4) NOT NULL,
        balance_after DECIMAL(18, 4) NOT NULL,
        biz_type VARCHAR(100) NULL,
        biz_id VARCHAR(255) NULL,
        ref_txn_id BIGINT NULL,
        remark TEXT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT credit_transactions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_account_fk FOREIGN KEY (account_id) REFERENCES credit_accounts (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_billing_task_fk FOREIGN KEY (billing_task_id) REFERENCES billing_tasks (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_payment_order_fk FOREIGN KEY (payment_order_id) REFERENCES payment_orders (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_application_fk FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_function_fk FOREIGN KEY (function_id) REFERENCES application_functions (id) ON DELETE RESTRICT,
        CONSTRAINT credit_transactions_ref_txn_fk FOREIGN KEY (ref_txn_id) REFERENCES credit_transactions (id) ON DELETE RESTRICT,
        INDEX credit_transactions_tenant_id_idx (tenant_id),
        INDEX credit_transactions_user_id_idx (user_id),
        INDEX credit_transactions_account_id_idx (account_id),
        INDEX credit_transactions_billing_task_id_idx (billing_task_id),
        INDEX credit_transactions_payment_order_id_idx (payment_order_id),
        INDEX credit_transactions_type_created_idx (txn_type, created_at),
        INDEX credit_transactions_biz_ref_idx (biz_type, biz_id)
      )`,
      `CREATE TABLE IF NOT EXISTS agent_relations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        agent_user_id BIGINT NOT NULL,
        referred_user_id BIGINT NOT NULL,
        tenant_id BIGINT NULL,
        relation_type ENUM('direct', 'indirect') NOT NULL,
        commission_rate DECIMAL(5, 4) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT agent_relations_agent_user_fk FOREIGN KEY (agent_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT agent_relations_referred_user_fk FOREIGN KEY (referred_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT agent_relations_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT agent_relations_rate_ck CHECK (commission_rate >= 0 AND commission_rate <= 1),
        INDEX agent_relations_agent_user_id_idx (agent_user_id),
        INDEX agent_relations_referred_user_id_idx (referred_user_id),
        INDEX agent_relations_tenant_id_idx (tenant_id),
        INDEX agent_relations_status_idx (status)
      )`,
      `CREATE TABLE IF NOT EXISTS agent_commissions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        agent_relation_id BIGINT NOT NULL,
        agent_user_id BIGINT NOT NULL,
        referred_user_id BIGINT NOT NULL,
        tenant_id BIGINT NULL,
        source_billing_task_id BIGINT NULL,
        source_transaction_id BIGINT NOT NULL,
        commission_transaction_id BIGINT NULL,
        application_id BIGINT NULL,
        function_id BIGINT NULL,
        consumed_points DECIMAL(18, 4) NOT NULL,
        commission_rate DECIMAL(5, 4) NOT NULL,
        commission_points DECIMAL(18, 4) NOT NULL,
        status ENUM('pending', 'settled', 'cancelled') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        settled_at TIMESTAMP(3) NULL,
        cancelled_at TIMESTAMP(3) NULL,
        CONSTRAINT agent_commissions_relation_fk FOREIGN KEY (agent_relation_id) REFERENCES agent_relations (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_agent_user_fk FOREIGN KEY (agent_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_referred_user_fk FOREIGN KEY (referred_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_source_billing_task_fk FOREIGN KEY (source_billing_task_id) REFERENCES billing_tasks (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_source_transaction_unique UNIQUE (source_transaction_id, agent_relation_id),
        CONSTRAINT agent_commissions_source_transaction_fk FOREIGN KEY (source_transaction_id) REFERENCES credit_transactions (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_commission_transaction_fk FOREIGN KEY (commission_transaction_id) REFERENCES credit_transactions (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_application_fk FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE RESTRICT,
        CONSTRAINT agent_commissions_function_fk FOREIGN KEY (function_id) REFERENCES application_functions (id) ON DELETE RESTRICT,
        INDEX agent_commissions_agent_user_id_idx (agent_user_id),
        INDEX agent_commissions_referred_user_id_idx (referred_user_id),
        INDEX agent_commissions_tenant_id_idx (tenant_id),
        INDEX agent_commissions_status_idx (status)
      )`
    ]
  },
  {
    name: "000003_phase_7_agent_approval",
    statements: [
      `CREATE TABLE IF NOT EXISTS platform_admins (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        role ENUM('owner', 'admin', 'operator') NOT NULL DEFAULT 'admin',
        status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT platform_admins_user_unique UNIQUE (user_id),
        CONSTRAINT platform_admins_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        INDEX platform_admins_status_idx (status),
        INDEX platform_admins_role_idx (role)
      )`,
      `CREATE TABLE IF NOT EXISTS agent_profiles (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        status ENUM('pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        approved_by_user_id BIGINT NULL,
        approved_at TIMESTAMP(3) NULL,
        rejected_at TIMESTAMP(3) NULL,
        rejected_reason TEXT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT agent_profiles_user_unique UNIQUE (user_id),
        CONSTRAINT agent_profiles_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT agent_profiles_approved_by_user_fk FOREIGN KEY (approved_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        INDEX agent_profiles_status_idx (status),
        INDEX agent_profiles_approved_by_user_id_idx (approved_by_user_id)
      )`
    ]
  },
  {
    name: "000003_users_username_identity",
    statements: [
      `ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL AFTER id`,
      `CREATE UNIQUE INDEX users_username_idx ON users (username)`
    ]
  }
];

const DOWN_TABLES = [
  "agent_profiles",
  "platform_admins",
  "agent_commissions",
  "agent_relations",
  "credit_transactions",
  "payment_callbacks",
  "billing_locks",
  "billing_tasks",
  "payment_orders",
  "tenant_settlements",
  "idempotency_keys",
  "application_functions",
  "credit_accounts",
  "tenant_members",
  "recharge_products",
  "applications",
  "tenants",
  "users",
  "schema_migrations"
];

const MIGRATION_NAMES = MIGRATIONS.map((migration) => migration.name);

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "credits",
    password: process.env.MYSQL_PASSWORD ?? "credits",
    database: process.env.MYSQL_DATABASE ?? "credits_platform",
    multipleStatements: false
  };
}

async function ensureMigrationTable(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      run_on TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);
}

async function up(connection) {
  await ensureMigrationTable(connection);

  for (const migration of MIGRATIONS) {
    const [existing] = await connection.execute("SELECT name FROM schema_migrations WHERE name = ? LIMIT 1", [
      migration.name
    ]);
    if (existing.length) {
      console.log(`Already applied: ${migration.name}`);
      continue;
    }

    await connection.beginTransaction();
    try {
      for (const statement of migration.statements) {
        await connection.execute(statement);
      }
      await connection.execute("INSERT INTO schema_migrations (name) VALUES (?)", [migration.name]);
      await connection.commit();
      console.log(`Applied: ${migration.name}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
}

async function down(connection) {
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of DOWN_TABLES) {
      await connection.execute(`DROP TABLE IF EXISTS ${table}`);
      console.log(`Dropped: ${table}`);
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

async function main() {
  const connection = await mysql.createConnection(mysqlConfig());
  try {
    if (process.argv.includes("--down")) {
      await down(connection);
    } else {
      await up(connection);
    }
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  MIGRATION_NAMES
};

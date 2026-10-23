const mysql = require("mysql2/promise");
const { MIGRATION_NAMES } = require("./migrate-mysql.cjs");

async function main() {
  const client = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || "credits_platform",
    user: process.env.MYSQL_USER || "credits",
    password: process.env.MYSQL_PASSWORD || "credits"
  });

  try {
    const [tables] = await client.execute(
      "select table_name from information_schema.tables where table_schema = database() and table_name = 'schema_migrations'"
    );
    const hasMigrationTable = tables.length > 0;
    const [applied] = hasMigrationTable
      ? await client.execute("select name, run_on from schema_migrations order by run_on, name")
      : [[]];
    const appliedNames = new Set(applied.map((row) => row.name));

    for (const file of MIGRATION_NAMES) {
      const marker = appliedNames.has(file) ? "up" : "pending";
      console.log(`${marker.padEnd(8)} ${file}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

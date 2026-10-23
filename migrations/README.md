# MySQL migrations

The active migration runner is `scripts/migrate-mysql.cjs`.

The previous `node-pg-migrate` files were removed when the platform moved from PostgreSQL to MySQL. Migration names are still preserved in the runner so existing phase documentation and `schema_migrations` history stay readable:

- `000001_phase_0_foundation`
- `000002_phase_1_core_schema`
- `000003_phase_7_agent_approval`

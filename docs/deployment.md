# Same-server deployment and operations

## Current one-company-account configuration

Use migration000011 and [decision 0022](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/decisions/0022-company-identity-and-lazy-product-profiles.md). Keep the existing same-host network/backup controls. For a fresh company installation configure separate strong tokens:

```json
[
  {"application":"simulation","issuer":"entroqi-company-v1","identityMode":"company","onboarding":"self_service","permissions":["provision","balance","unlink"],"token":"REPLACE_WITH_PRIVATE_SIMULATION_TOKEN"},
  {"application":"company-identity","issuer":"entroqi-company-v1","identityMode":"company","onboarding":"self_service","permissions":["close"],"token":"REPLACE_WITH_DIFFERENT_PRIVATE_IDENTITY_TOKEN"}
]
```

Place real tokens only in the private environment, never source or browser config; placeholders intentionally fail credential validation. Simulation's `MODEL_LAB_BILLING_TOKEN` uses its product token, while `MODEL_LAB_BILLING_CLOSE_TOKEN` belongs to the currently co-hosted company identity authority. The runtime rejects identical/missing closure credentials and validates issuer/application acknowledgements. Future product processes must never receive the closure token. Add each future app's product token under the same issuer, with no duplicated login/customer and no `close` permission.

Startup durably registers namespace/app bindings and refuses reassignment. Existing operational data requires a stopped backup, inventory and an explicit identity adoption/migration plan: never merely change an old configured issuer, merge by email, move balances or silently reassign subjects. Existing Simulation subjects/passwords remain in their central auth store; no new company subjects are generated for existing users. Fresh installation is the prepared first-web target; this work did not migrate a deployed database. Legacy managed products retain explicit isolated issuers and their own onboarding policy. [Verified source status](verification/company-identity-2026-10-25.md).

Status: prepared, not deployed. No server/domain/merchant credentials supplied; local Docker socket denied and npm DNS unavailable. CI must pass before using this package.

Keep source repositories separate. Install the tested simulation classroom release as its existing loopback service on the SAME host. Run Credits/MySQL with `deploy/compose.yml`; only `127.0.0.1:3100` is published, MySQL has no host port. An internal Docker network isolates the database. Do not proxy billing ports publicly. The existing simulation HTTPS proxy remains the public entry point.

1. Pin the tested Credits commit and tested simulation package version. Back up any existing data before migrations; use fresh Entroqi databases, never car-sales operational databases.
2. Create a private environment file outside source control. Set unique MYSQL_PASSWORD/MYSQL_ROOT_PASSWORD and CREDITS_SERVICE_CREDENTIALS. Use the two company-mode credential roles above: Simulation product provision/balance/unlink, and separate identity-authority close. Tokens need at least43 URL-safe random characters. Generate with `openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'`. Configure a separate isolated issuer only for a legacy managed product; company apps share the company issuer. No browser receives tokens.
3. From deploy/, run `docker compose --env-file /private/credits.env up -d mysql`, then `docker compose --env-file /private/credits.env run --rm credits npm run db:migrate`, then `docker compose --env-file /private/credits.env up -d credits`. Build occurs from the pinned local source. Apply schema once before serving; MySQL DDL is not transactionally rolled back.
4. Configure the simulation process with MODEL_LAB_BILLING_URL=http://127.0.0.1:3100 and MODEL_LAB_BILLING_TOKEN matching its product service credential and MODEL_LAB_BILLING_CLOSE_TOKEN matching the separate company identity authority. Preserve its existing HTTPS origin, auth secret, mail settings, data directory and loopback proxy rules. Without both billing settings, leave billing disabled.
5. After verified login, same-origin POST `/api/billing/customer` with an empty body returns zero balance on first access. Anonymous access must fail; identity fields in a body must fail; repeated access must retain the same wallet. Stop Credits and verify local simulation/export still works. Verify port 3100 and database ports are unreachable externally.
6. Back up MySQL separately from simulation SQLite/control files. For example use mysqldump with `--single-transaction --routines --triggers`, protected credentials and encrypted backups; rehearse a restore to an isolated database and verify mappings/balances. Do not use db:rollback: it drops tables. Application rollback must retain the additive schema and financial data.

Only health, readiness and `/v1/customer` are mounted by the standalone server. Legacy route builders remain source-compatible for future reviewed adapters but are not reachable through this entry point. No payments, callbacks, spending, commissions or public billing UI are enabled. Managed onboarding means an authorized product backend provisions after its own staff/agent authorization; this service does not contain a three-tier account-management UI or role engine. Existing agent/account core is preserved for that future adapter.

One main branch contains reusable core and policy configuration. Original source: commit 306fbf3d41b863e3baa07bd54c99c2abba2d78db; car-sales source bc8b8d78c8c930b09d2826db7302b64b7801f919, subtree 726a23f9a05ec2c63f40a4a482a28916d310b7ec. No source-company customer data or merchant configuration imported.

## Product closure and retained history

For a company product, use a distinct app/token under the shared issuer; for an isolated legacy product, use a distinct issuer. Rotation keeps the issuer. Startup validates explicit company/isolated modes and persisted [namespace bindings](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/architecture/data-ownership-and-cloud-lifecycle.md#4-multiple-applications-and-identity); reassignment is refused across restarts. Keep per-product databases/grants and object policies separate. Current engine regression qualifies disposable MySQL CI tables only: check actual deployed engines, grants and restore/reconciliation before service activation. [Review](verification/database-architecture-2026-10-25.md).

The simulation now implements its own reauthenticated lifecycle and minimal retained audit history under [decision 0019](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/decisions/0019-account-closure-and-retained-history.md). Its backend close permission is explicit; do not add it to unrelated credentials by default. Product authentication and independent anti-rollback control remain separate from this MySQL financial database. Product closure must call this private API and preserve blocked obligations; do not delete financial rows or reopen the old subject to compensate for a product-side error. A recycled email/phone cannot authorize access to old balances/history.

The simulation source checkpoint and clean CI are tracked in its [closure verification](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/verification/account-closure-2026-10-24.md). Never infer deployment, merchant proof or paid readiness from the presence of that integration. Keep current financial tombstones/ledger and independently protected product lifecycle evidence across restores.


## Private network defaults — 25 October 2026

Native service defaults to HOST=127.0.0.1. Canonical deploy Compose explicitly sets HOST=0.0.0.0 inside its isolated container and publishes only 127.0.0.1:3100; MySQL has no published host port. Keep that explicit container setting. The separate developer Compose exposes MySQL only at 127.0.0.1:3310; use MYSQL_PORT=3310 for it. Sample credentials are development-only. Source defaults do not change existing configurations/services/databases. [Verification](verification/network-defaults-2026-10-25.md).

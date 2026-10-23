# Reusable Credits Platform

Backend foundation for a reusable, pluggable billing and credits platform module.

## Phase 0

This repository currently contains the project foundation:

- Fastify TypeScript service
- OpenAPI documentation baseline
- MySQL Docker Compose setup
- MySQL migration tooling through `scripts/migrate-mysql.cjs`
- Health and database readiness endpoints
- Lint, typecheck, test, and integration-test scripts
- Phase 1 relational schema for the billing and credits module
- Phase 2 core domain services for account resolution, application lookup, idempotency, ledger writes, and balance row locking
- Phase 3 billing usage flow endpoints for estimate, freeze, settle, refund, task lookup, and account transactions
- Phase 4 recharge product, payment order, signed callback, and recharge ledger flow endpoints
- Phase 5 external AI application registration and pluggability contract endpoints
- Phase 6 tenant/admin query and member-management endpoints
- Phase 7 agent relation and commission generation/settlement endpoints

## Integration Contract

External AI applications can register products and billable functions through the integration APIs, then use the billing lifecycle APIs to estimate, freeze, settle, or refund credits. See [docs/integration-contract.md](docs/integration-contract.md).

## usedCarPlatform Setup

The usedCarPlatform integration can be prepared with an idempotent seed script after database migrations have run:

```sh
npm run db:migrate
npm run seed:used-car
```

For local end-to-end testing, seed a demo user, personal account, tenant, and tenant account:

```sh
npm run seed:used-car:demo
```

The script registers:

- `used-car-platform` as an external application
- used-car single-image functions at `30.0000` credits each
- used-car batch item functions at a `30.0000` credit baseline, with usedCarPlatform sending dynamic `estimatedPoints` when multiple visual-processing options are toggled
- Enterprise Basic, Team, and Flagship recharge products

## Local Setup

```sh
cp .env.example .env
npm install
docker compose up -d mysql
npm run db:migrate
npm run dev
```

Service URLs:

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Database readiness: `http://localhost:3000/health/db`
- OpenAPI JSON: `http://localhost:3000/openapi.json`
- Swagger UI: `http://localhost:3000/docs`

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
```

`test:integration` expects MySQL to be running and the `MYSQL_*` environment variables from `.env.example` to be set.

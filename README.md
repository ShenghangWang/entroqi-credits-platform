# Entroqi Credits Platform

Private standalone shared billing core. One maintained main branch; per-product onboarding policies support self-service or authorized-staff provisioning. Original unmodified extraction is preserved at commit `306fbf3d41b863e3baa07bd54c99c2abba2d78db`.

The standalone entry point exposes authenticated zero-balance customer provisioning and balance queries only. Existing legacy ledger, payment and agent implementations remain in source for subsequent hardening; they are not mounted by this server. This is an integration foundation, not a live payment service.

See [deployment](docs/deployment.md) and [implementation specification](docs/tasks/B02-B03-private-identity.md). Simulation owns login/passwords/verification; billing stores only immutable issuer/subject mappings and wallets. No email-based account merging, agent requirement, default credits, copied operational data or atlas implementation.

Checks: `npm ci --ignore-scripts`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Isolated MySQL: `npm run db:migrate`, then `npm run test:integration -- tests/private-identity.integration.test.ts`. CI runs these plus Docker packaging.

For local start configure MYSQL_* and CREDITS_SERVICE_CREDENTIALS as described in deployment instructions, migrate, then `npm run dev`. Do not start the legacy app builder as a public service.

# Entroqi Credits Platform

[28 October security review](docs/verification/public-release-security-2026-10-28.md): legacy caller-identity API/payment adapters are test-only and fail closed outside tests. Use only the authenticated private production entry point. Repaired replay/signature/configuration controls do not enable payments. See [security policy](SECURITY.md) and existing commercial gates before accepting money.

Current owner correction: [one company account across apps](docs/verification/company-identity-2026-10-25.md), verified on `83003ae3` with 120 unit and 29 real MySQL tests plus full build/audit/migration/Compose/Docker checks. Explicit company-mode credentials share a stable issuer/subject and financial customer/wallet; namespaces and app bindings persist. Products own lazy profiles/roles and may unlink their own membership. Only the company identity authority can close the global financial identity. Legacy isolated issuers remain supported; no automatic merge or paid enablement.

[Database/multi-app review](docs/verification/database-architecture-2026-10-25.md) and [current integration contract](docs/integration-contract.md) separate this customer API from future paid services. Products own projects/jobs; Credits owns financial state. The earlier separate-app assumption is superseded by company mode and persisted namespace registration; isolated legacy issuers retain strict separation.

Private standalone shared billing core. One maintained main branch; per-product onboarding policies support self-service or authorized-staff provisioning. Original unmodified extraction is preserved at commit `306fbf3d41b863e3baa07bd54c99c2abba2d78db`.

The standalone entry point exposes authenticated zero-balance customer provisioning, balance queries and permission-scoped guarded customer closure. Existing legacy ledger, payment and agent implementations remain in source for subsequent hardening; they are not mounted by this server. This is an integration foundation, not a live payment service.

See [deployment](docs/deployment.md) and [implementation specification](docs/tasks/B02-B03-private-identity.md). The company identity authority owns login/passwords/verification; Simulation is its first client. Billing stores immutable issuer/subject mappings, scoped membership and wallets. No email-based account merging, agent requirement, default credits, copied operational data or atlas implementation.

Checks: `npm ci --ignore-scripts`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Isolated MySQL: `npm run db:migrate`, then `npm run test:integration` for every database suite. CI runs these, a production dependency audit and Docker packaging. Development/CI uses Node 24.19.0; the container is independently built in CI.

For local start configure MYSQL_* and CREDITS_SERVICE_CREDENTIALS as described in deployment instructions, migrate, then `npm run dev`. Do not start the legacy app builder as a public service.

## Latest MVP review

Runtime/dependency source c1f5c80b9f4bc2569bbf50e5ee7bdc7811b35fba passed [40043859238](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/40043859238): 117 unit tests, 26 MySQL integration tests, types/lint/build, repeated migration, audit and Docker checks. Full local JavaScript audit reports zero known advisories after patched dependency/test-tool updates. This is dated registry evidence, not proof of zero defects. See the [financial review](docs/verification/billing-review-2026-10-24.md) and [margin policy](docs/architecture/paid-offer-margin.md); paid checkout/refunds/entitlements and actual host/provider operations remain gated.


Native service/developer database defaults pass [source-bound verification](docs/verification/network-defaults-2026-10-25.md) on d9bcfe3b/run 40179536866: 118 unit tests, 26 real MySQL tests, types/lint/build, repeated migrations, clean production audit, both Compose recipes and Docker. Canonical deployment retains its explicit internal bind and host-loopback mapping. Paid services remain disabled.

Development and release runs follow the [private CI cost policy](docs/ci-policy.md): local checks and batched pushes, shared allowance monitoring, protected manual full verification and no automatic spending.

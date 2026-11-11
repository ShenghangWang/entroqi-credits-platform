# Entroqi Credits Platform

One source home for the shared financial service and its **original Vue back office**, maintained under `back-office/` with complete imported history. The former standalone console repository is an archived provenance copy. Public source is owner-authorized; staff/service access, credentials, operational databases and private product source remain private.

Start with [AGENTS](AGENTS.md), then the [current source and policy map](docs/current-state-and-policy-map.md). Refresh actual checkout/branches/PRs before work; preserve unique progress and compare the existing implementation before interpreting an old plan as unfinished code.

## Guiding document map

| Question | Authority |
| --- | --- |
| What is implemented/mounted, retained-but-disabled, or awaiting live qualification? | [Current source/policy map and library](docs/current-state-and-policy-map.md) |
| How do owners use pricing, trials, bundles and what blocks activation? | [First-web readiness and gates](docs/first-web-release-readiness.md) |
| What are service boundaries and product integration rules? | [Integration contract](docs/integration-contract.md), [service boundaries](docs/architecture/service-boundaries.md) |
| What are the existing financial contracts? | [Offers/console](docs/flexible-offers-and-console.md), [subscription calendar](docs/subscription-periods.md), [bundles](docs/bundle-pricing-plan.md), [cost floors](docs/architecture/paid-offer-margin.md) |
| How is the original UI maintained? | [Console README](back-office/README.md), [console instructions](back-office/AGENTS.md), [reuse/provenance](docs/full-back-office-reuse.md) |
| How do we deploy/recover/administer the service? | [Deployment](docs/deployment.md), [server credential recovery](docs/developer-account-recovery.md), [email recovery](docs/owner-email-recovery.md), [owners/audit](docs/owner-administration-and-audit.md) |
| How is verification scoped and recorded? | [CI policy](docs/ci-policy.md), existing task specs and dated `docs/verification/` records |

The library labels historical host-app plans and dated implementation sequences. They preserve policy/provenance but do not independently schedule new work or prove current activation. Scope/state/commands/evidence have separate owners; update them in place rather than creating another launch queue.

## Existing boundaries to retain

Company identity remains the sole customer signup/password authority. Credits owns scoped financial identity, wallets, immutable offers/quotes/contracts, receipts/refunds and audit. Product data/roles and app-specific paid rights remain separate. Registration never imports another organization's users/data or creates purchase proof. Use the established company registry, original console and per-product adapters; do not build another account store, wallet-based unlock or replacement console.

Named owners, short-lived staff sessions, calculator, draft/review/publish/withdrawal, four subscription periods, optional trials, exact-combination discounts and attributed audit have implemented portions. Unmounted legacy policy/provisioning/agent-money controls stay unavailable. Historical signed rights remain readable; new lifetime/version-license sales and automatic renewal are not enabled. Actual merchant/provider/host/mail/restore qualification still gates live services; source publication does not collect payments.

## Fresh setup and changed-code checks

Use Node 24.19.0 and the committed backend/console locks. Inspect a qualified matching checkout before reinstalling or rebuilding it. For a fresh or relevant changed checkout:

```sh
npm ci --ignore-scripts
npm run install:console
npm run typecheck
npm run lint
npm test
npm run build
```

`build` includes both the server and original console. Configure the absolute `back-office/dist` path via private `CREDITS_CONSOLE_DIRECTORY`; the container includes it. Real database/browser checks require the explicitly disposable setup in [deployment](docs/deployment.md) and [console verification](back-office/README.md#verification), run sequentially. Never use operational/former-employer data. Use the authenticated production entry point, not historical test-only builders.

Guidance-only edits need documentation/preservation checks, not an unchanged full runtime rerun. Runtime, dependencies, migrations, financial policy or enabled configuration changes retain their existing full qualification. Current source/evidence and all remaining gates are in the map above; dated test counts are not refreshed by a new documentation date.

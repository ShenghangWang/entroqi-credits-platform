# Billing architecture and financial review — 24 October 2026

This is a source review and verification record, not a guarantee of zero defects or permission to accept money. The production entry point is `src/server.ts` → `buildPrivateApp`. Legacy financial/admin routes remain unmounted. No live account, payment, database or host was migrated.

## Ownership and maintenance decision

Follow [service boundaries](../architecture/service-boundaries.md) and the simulation [architecture decision](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/decisions/0016-shared-billing-ownership-and-lifecycle.md). Keep one Credits main with explicit onboarding policy. Preserve the legacy baseline tag; use short-lived repair branches for changes, not permanent product forks.

Simulation owns verified login/session lifecycle, local models, product UX, task admission and enforcement of server-issued entitlements. Credits owns immutable financial identity, versioned financial offers/quotes, orders, wallets, reservations, ledger and payment reconciliation. Storage/workers own authoritative resource receipts and quotas. Generic paid entitlements belong beside financial order state; simulation consumes them and never trusts browser plan flags. Offer descriptions and product feature choices can live in simulation; charge amounts and granted quantities must be validated against the Credits catalog. These are target boundaries; the paid catalog/entitlement workflow is not implemented yet.

Retain the existing MySQL service and deployment on the same host. Do not introduce an event broker, cache, another identity provider or another financial database merely to extract Credits. A small durable payment-dispatch table/outbox is required before paid use, because network I/O currently runs in a database transaction. Do not copy SQL into product apps. Convert the legacy PostgreSQL-style SQL compatibility layer incrementally, with real MySQL tests, rather than attempting an unverified rewrite.

## Findings and disposition

| Area | Finding | Disposition |
| --- | --- | --- |
| Contact reuse | Car capability deletion marked the login deleted but kept its UNIQUE phone; registration rejected it. | Targeted [car repair PR #1](https://github.com/ShenghangWang/AI-Car-Salesperson/pull/1), with historical repair SQL and MySQL verification. Not merged/deployed. Old usernames deliberately stay reserved because legacy linking still matches usernames. |
| New financial identity | Provision-only mapping lacked account closure semantics. | Scoped `close` permission and transactional closure: clear contacts/password, close wallets, retain issuer/subject tombstone and financial history. Old subject cannot reprovision, including a never-provisioned subject closed first. Returning verified subject receives a new zero wallet. |
| Outstanding obligations | Contact removal alone could orphan credits or responsibilities. | Closure refuses nonzero balances/reservations, unfinished tasks/locks/orders, active membership/admin/agent responsibilities and pending commissions. It neither forfeits funds nor issues a cash refund. |
| Balance mutation | Negative/zero/malformed amounts lacked explicit domain guards. | All four balance mutations reject them before SQL; reject DECIMAL(18,4) input/result overflow. Zero actual usage is handled by releasing its reservation, not by a negative or zero balance mutation. |
| Settlement | Legacy settle always charged the full reservation. | Optional trusted `actualPoints`, bounded by its hold; partial/zero usage releases unused credits in the same transaction, with ledger evidence and retry checks. Default remains full settlement for legacy callers. This is a domain capability, not an exposed paid worker API. |
| Retry scope | Different billing operations shared a user's caller key, allowing the wrong operation's response to replay. | Operation-prefixed hashed keys. Existing operation response replay remains idempotent. This new extracted database contains no imported operational retry keys; existing legacy databases would need a coordinated rollout. |
| Wallet duplication | Owner was indexed but not unique. | Add owner/currency UNIQUE indexes. Preflight rejects duplicate wallets for manual financial reconciliation; never sums, merges or deletes historical wallets. Resumes partially applied new indexes and repeated migrations. Resolver selects credits currency explicitly. |
| Callback evidence | Float comparisons could round payment evidence; callback channel was not matched to order. | Exact decimal-to-minor-unit parsing, safe provider integer conversion, required WeChat CNY evidence, channel binding, malformed timestamp rejection. |
| Paid-offer floor | Supplier-only markup omitted labor and could make a large storage offer underpriced. | Exact-cent cost-review helper requires expiring versioned evidence, positive labor allocation and a contribution floor; 60% target / 50% minimum is the chosen Entroqi policy. It is not yet wired to a paid catalog/order. See [margin contract](../architecture/paid-offer-margin.md). |
| Configuration diagnostics | Malformed service-credential JSON could expose parsed input through a startup diagnostic. | Normalize malformed JSON to a generic message; diagnostic tests assert the submitted credential is absent. |
| Verification coverage | CI ran only identity integration. | All database suites run serially against MySQL 8.4, migrations run twice, plus unit/types/lint/build/Compose/Docker. Test reset includes external identities. |

## Remaining paid-launch blockers

1. Provider query responses need authenticated response verification and binding of merchant/app/order/amount/currency before a terminal state is accepted. WeChat platform key serial/key identity must be bound and rotation rehearsed. Current verified-callback unit tests are not a merchant sandbox rehearsal.
2. Durable provider dispatch/reconciliation outside database transactions, bounded network/response handling, timeout/unknown outcome recovery and payment/refund race testing are still required. Current provider network calls have no explicit timeout.
3. Implement actual cash refunds, chargebacks, reconciliation and entitlement revoke/restore. Existing `BillingService.refund` only releases a reservation; do not label it a payment refund.
4. Operation-scoped request keys do not yet enforce independent business-job uniqueness. Add a business identity constraint after duplicate preflight and test changed-key retries/cancellation/worker receipt replay before exposing usage APIs.
5. The simulation integration is now implemented in source `226746e4b2cdcebd0689f4c4ed7dee9d22d86ffd`, with its own retained-history, reauthentication, session/lesson, prepared-recovery and return-signup tests. Track its clean source CI and actual public activation in the [product closure verification](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/verification/account-closure-2026-10-24.md); do not treat local fixtures as deployed financial closure. The car repair remains separate and unmerged.
6. Legacy SQL translation still uses INSERT IGNORE for some conflict paths, which can mask warnings; domain IDs still convert BIGINT to Number. Replace unsafe conversions and define the migration/ID contract before importing large operational databases. A source review cannot establish production data cleanliness.
7. Scope/version the shared recharge catalog and offers per product. Do not run the used-car seed against a shared commercial catalog: it disables unrelated products. Agent tables remain for managed products, but must not be mounted by default or copied into simulation.
8. Rehearse backup/restore, least-privilege database roles/ledger immutability, credential rotation, server failures, resource limits and cleanup on the selected host. No live query plan/load/retention benchmark has been performed.

## API lifecycle contract

Only an explicitly configured backend credential containing `close` can send `POST /v1/customer` with `{ subject, action: "close" }`. The product derives subject from a reauthenticated session; no browser-supplied subject or wallet ID is accepted as authority. Success is `{ closed: true }`; retry is safe; obligations return 409 `closure_blocked`; database failure returns 503. Once financial closure succeeds, the product must complete auth deletion, retrying safely if that second step fails. Never restore the old financial mapping to compensate. Mixed legacy direct-SQL writers are not a supported deployment of this new lifecycle.

Closing releases identifiers in canonical users, not every archival log or an external auth database. Financial records and audit retention remain a separate policy. Free local work and existing local files do not depend on the billing service.

## Verification

Earlier complete run [39998664551](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/39998664551): 98 unit tests and 22 MySQL integration tests, types/lint/build, repeated migration, Compose and Docker. Later actual-usage/operation/lifecycle changes require their own final run evidence below. Car [39998544743](https://github.com/ShenghangWang/AI-Car-Salesperson/actions/runs/39998544743) passed actual deletion/repair SQL against MySQL UNIQUE constraints and backend TypeScript; no full car signup E2E or live migration was performed.

Keep the commercial delivery queue authoritative for next work. The simulation's T01–T62 acceptance remains 19/62 (40.34%); these engineering fixes do not claim public or paid launch readiness.

Final runtime verification: [39999264127](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/39999264127) passed at commit `ee707ed14099e3eebc1f9b8c7a474905e405b6ab`: 98 unit tests and 26 MySQL integration tests, TypeScript, lint, build, two migration runs, Compose validation and Docker build. This includes actual/zero settlement, above-hold rejection, operation retry separation, closure/contact reuse and concurrent provisioning. Later documentation-only commits do not change this tested runtime.

## Latest cost-policy and diagnostic verification

Runtime `c7408f141c79150c728b88413c82d530582a4719` passed [40006941035](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/40006941035): **117 unit tests and 26 MySQL integration tests**, TypeScript, lint, build, two migration runs, Compose validation and Docker build. New checks include exact-cent fee/contribution rounding, expired/invalid versioned costs, required labor, under-margin offers, rejection of numeric payment evidence and redaction of malformed credential configuration. This supersedes the earlier 98-test checkpoint for the current runtime; historical runs remain above for traceability.

The pure price-floor helper does not charge, create an offer, dispatch resources or satisfy the paid-launch blockers. Integrate it once in the trusted versioned catalog/quote/order path before enabling any paid service. Keep the public customer signup path separate from private company financial authority; [decision 0018](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/decisions/0018-company-access-ai-and-release.md) rejects a mandatory reseller hierarchy for self-service products.

## Whole-project MVP dependency review

The new audit exposed vulnerable Fastify/URI/router/Swagger/database versions and development-test packages despite earlier functional success. Runtime/dependency source `c1f5c80b9f4bc2569bbf50e5ee7bdc7811b35fba` passed [40043859238](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/40043859238): production audit, 117 unit tests, 26 MySQL integration tests, types/lint/build, repeated migrations, Compose and Docker. Direct pins now include Fastify 5.12.7, MySQL2 3.23.1, Swagger UI 6.1.2 and Vitest 5.0.5 with refreshed transitive locks. Full local npm audit also reports zero known advisories; this is a dated JavaScript dependency check, not a Rust/native or penetration-test certificate.

The product-side adapter additionally requires an immutable expected workspace owner, revalidates the session before returning a late balance and checks balance arithmetic. Product code remains in simulation. None of these updates enables legacy financial routes, merchant collection or unfinished cash refund/storage/worker operations. Simulation account deletion and the actual public support/data notice remain an MVP gap in the existing lifecycle work.

## Product lifecycle integration checkpoint

Owner clarification of 24 October requires logical account closure with necessary retained investigation/financial history. Simulation source `226746e4b2cdcebd0689f4c4ed7dee9d22d86ffd` now calls the existing authenticated close contract after verified password/owner checks and durable pending revocation, before deleting its active login records. It retains a separate historical subject and recovers prepared failures; the same contact registers a fresh subject rather than inheriting the old wallet. Credits runtime/financial schema are unchanged, and all financial history/obligation guards remain. New product clean CI is [40064753234](https://github.com/ShenghangWang/ai-native-simulation-platform/actions/runs/40064753234); its actual result belongs in the linked product verification record. This supersedes the earlier product-wiring gap description without claiming actual provider/host activation or paid commerce completion.

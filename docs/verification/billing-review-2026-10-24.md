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
| Verification coverage | CI ran only identity integration. | All database suites run serially against MySQL 8.4, migrations run twice, plus unit/types/lint/build/Compose/Docker. Test reset includes external identities. |

## Remaining paid-launch blockers

1. Provider query responses need authenticated response verification and binding of merchant/app/order/amount/currency before a terminal state is accepted. WeChat platform key serial/key identity must be bound and rotation rehearsed. Current verified-callback unit tests are not a merchant sandbox rehearsal.
2. Durable provider dispatch/reconciliation outside database transactions, bounded network/response handling, timeout/unknown outcome recovery and payment/refund race testing are still required. Current provider network calls have no explicit timeout.
3. Implement actual cash refunds, chargebacks, reconciliation and entitlement revoke/restore. Existing `BillingService.refund` only releases a reservation; do not label it a payment refund.
4. Operation-scoped request keys do not yet enforce independent business-job uniqueness. Add a business identity constraint after duplicate preflight and test changed-key retries/cancellation/worker receipt replay before exposing usage APIs.
5. Simulation auth deletion/session revocation and publication ownership handling are not wired to `close` yet. Add a reauthenticated library deletion hook with failure/retry tests before exposing self-service account deletion. The car repair is a separate managed-product path.
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

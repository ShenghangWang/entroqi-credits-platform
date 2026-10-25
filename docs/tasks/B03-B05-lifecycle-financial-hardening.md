# B03/B05 — account lifecycle and financial invariants

Owner authorization: 24 October 2026. Dependencies: private identity adapter/extraction checkpoint. This task repairs reusable core and documents the legacy application's bug; it does not enable live paid routes or change numerical simulation scope.

## Implementation

1. One customer service for scoped zero-wallet provisioning, balance and idempotent close. Add mapping tombstones. Release retained phone/email/username on completed closure; retain immutable old IDs/ledger and reject old-subject reprovisioning. New verification/subject produces an empty new wallet. Deny arbitrary browser identity or closure calls.
2. Closure blocks unresolved positive balances, holds, pending payment orders and organization/agent responsibilities; retries do not erase money or resurrect users. Distinguish suspended vs deleted/closed and retain tombstones. Product deletion needs session/reauth and fail-safe retry handling.
3. Add preflight plus personal/tenant wallet ownership uniqueness; migrations refuse dirty duplicates rather than merging. Do not drop legacy operational tables or copy old databases.
4. Guard credit mutations against negative/zero/oversized amounts as appropriate. Actual settlement permits zero, never exceeds the reserve, charges actual and releases unused hold atomically. Preserve ledger and replay behavior.
5. Parse currency minor units exactly; reject malformed/unsafe provider amounts. Review provider signature/order identity/query trust and network I/O recovery; keep unverified paths disabled and explicit residual gates.
6. Regression and real isolated MySQL tests cover same-phone/email return, fresh IDs/no old history, old-subject tombstone, multiple concurrent attempts, pending funds/hold/order denial, no negative mutations, 20-reserved/12-used, zero actual, over-reserve, duplicate terminal operations and wallet uniqueness.

## Acceptance and evidence

Run full unit/type/lint/build and isolated MySQL suites (serial when suites reset tables), fresh/repeated migrations and Docker packaging. Keep full review findings with fixed/open status. No bug-free-production claim, no merchant setup or paid traffic, no destructive cleanup of live data. Original car-sales baseline tag remains unchanged. A product-layer phone reservation must be fixed at that layer or explicitly identified as an unmigrated legacy application path; a shared SQL fix alone cannot erase a separate product database reservation.


## Verified implementation checkpoint — 24 October

See [review and CI evidence](../verification/billing-review-2026-10-24.md). Guarded closure/tombstones/contact release, positive bounded balance mutations, wallet owner/currency uniqueness with duplicate preflight, exact money and callback channel binding, partial/zero actual settlement, unused reservation release and operation-scoped retry keys are implemented and tested. All four MySQL integration suites now run serially in CI; migrations are repeated.

Still open: simulation auth deletion/session/publication handling; independent business-job uniqueness; authenticated provider query proof/key rotation; durable provider dispatch and bounded I/O; true cash refunds/reconciliation; product catalog and entitlements; live deployment/restore/payment evidence. Legacy car phone-reuse code is separately tested in [PR #1](https://github.com/ShenghangWang/AI-Car-Salesperson/pull/1), not merged or deployed. Do not mark B03/B04/B05 complete or enable paid routes on the strength of this checkpoint.

## Database retention and scalability acceptance — 24 October 2026

The [25 October data/lifecycle contract](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/architecture/data-ownership-and-cloud-lifecycle.md) supplies actual/target schema ownership and existing B02–B07 delivery allocation. Product projects/manifests/objects/jobs stay out of Credits; purchased rights, exact prices/orders/holds and financial receipt effects remain here. Additive durable issuer/app binding must reject reassignment across restarts before a second real app; verify/adopt existing issuer mappings explicitly. App-scoped offer versions, business uniqueness, authenticated mutation scope, outbox/inbox and fulfillment/restore remain pending commercial gates, not implemented by current customer credentials. Same-configuration namespace guards and three-app customer isolation/rotation/closure regressions are recorded in [review evidence](../verification/database-architecture-2026-10-25.md).

Status: specification; the additional tests and load measurements below remain pending. Retain shared Credits on MySQL/InnoDB. Do not migrate to PostgreSQL before release without representative benchmark evidence of an unmet requirement after tuning. This extends existing B03/B05 hardening, not the simulation's 62-task scope. The first free local SD/ABM/DES web MVP must proceed independently; the two future headless products need their own workload qualification. Preserve isolated product databases and authenticated APIs.

Audience/outcome: operators and users of all three products need correct balances and predictable overload behavior. Reuse existing mysql2 pool/transactions, wallet row locks, exact-decimal arithmetic, ledger, idempotency and MySQL test fixtures. This applies local ownership, replaceable service boundaries and sustainable operating cost principles; numerical/teaching validity is unaffected. No new engine, broker, cache or general storage rewrite is required.

### Required implementation boundaries

- Keep reserve and settle/release transactions short. Commit durable business-job/hold identity before external dispatch; release the connection during provider, AI or simulation work. Balance, hold/task, append-only ledger and replay result commit atomically. Preserve row-lock-before-update semantics; a conditional debit alternative must check funds and affected-row count atomically.
- Independent business uniqueness must include application and authoritative payer/job identity, not only caller request keys. Reusing a key with a changed body conflicts; a different key for the same job cannot create a second hold/charge. Trusted receipts bind application, job, payer and usage; browser claims never authorize settlement.
- Resolve settlement/cancel/expiry races by durable terminal state and verified receipts. Retain unknown outcomes for reconciliation; lease/hold expiry alone cannot prove no charge or no running job. Crash/retry may not dispatch twice or overcharge. Provider I/O uses durable dispatch/reconciliation outside wallet transactions; reservation release is not a cash refund.
- Bound deadlock/lock-timeout retry count/backoff, rollback before retry and reuse business identity. Bound aggregate pool connections across replicas with database headroom, queue length/acquisition time and overload rejection. Choose indexes from observed equality/range/order access paths and EXPLAIN; do not add speculative indexes or promise unlimited scaling.
- Confirm actual financial table engines through information_schema as InnoDB. Current migrations rely on the server default, so source alone does not verify deployed engine. Rehearse ledger-preserving restore and reconciliation; never auto-merge duplicate wallets or delete financial history.

### Independent tests and evidence required

Run isolated real MySQL integration tests with multiple independent connections and coordinated starts (serial test-suite scheduling is not a concurrency test):

1. Seed 100 credits; race at least 20 distinct 10-credit reservations on one wallet. Exactly ten succeed, with available=0, locked=100, total=100 and exactly one matching hold/ledger effect per success. Failed reservations leave no partial writes. Repeat across independent wallets to distinguish hot-row serialization from system throughput.
2. Retry the same operation concurrently with identical key/body, changed body and changed keys for one business job. Prove one effect/replay, conflict on changed body and business uniqueness despite changed keys. Same job IDs in distinct application scopes remain isolated; unauthorized cross-product mutation is rejected.
3. Race settle/cancel/release and duplicate trusted receipts; cover full, 20-reserved/12-used, zero-used and over-reserve. Assert available=total-locked, all components nonnegative, actual charge at most its hold and one terminal financial effect. Reconcile ledger deltas against before/after balances and remaining holds after every scenario.
4. Inject rollback after wallet update and before ledger/outcome commit; lose the response after commit; terminate/restart after reservation and during unknown dispatch/settlement. Replaying durable identity must preserve funds and return/reconcile one outcome without an extra dispatch. Force deadlock/lock timeout and pool exhaustion; verify bounded retry/overload, connection release and no leaked holds or partial ledger.
5. Restore a disposable backup with post-snapshot/unknown operations, reconcile against trusted receipts and prove no double credit/debit or silently released active hold. Record actual engine, schema/index definitions, isolation level and least-privilege ledger mutation policy.

Before broad paid/headless traffic, predeclare expected concurrent requests, job arrival/burst/retry mix, dataset size, p95/p99 latency/error targets and connection budget; owner/operator supplies demand assumptions. Run hot-wallet, many-wallet and mixed three-application workloads, including slow external work outside transactions, restart and sustained overload. Record source/seed/config/hardware/MySQL version, duration, throughput, p95/p99, error/timeout rate, transaction and pool-wait duration, lock waits/deadlocks, connections, CPU/I/O and independent final ledger reconciliation. Include EXPLAIN for hot queries. Report unmet targets and a bounded supported envelope, not a user-count guarantee.

Only propose PostgreSQL after repeatable evidence isolates an unmet database requirement despite short transactions, appropriate indexes and bounded pooling, with comparable workload/hardware, operational cost and migration/rollback review. These pending gates prohibit paid enablement claims; they do not delay the free first web release or count as completed tests.

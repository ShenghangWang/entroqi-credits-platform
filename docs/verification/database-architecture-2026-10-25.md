# Database and multi-app architecture review — 25 October 2026

Status: source review and local unit/type verification complete; exact-source private CI pending. No production database, financial record, credential, provider or deployment changed. This record will be finalized after CI.

## Inspected source and findings

Baseline Credits `e175b9306e858fe3683643020901930d5e2d16de`; Simulation `dc6c4c3dba6c4bb0996ac73138533ddd7c58b3c1`. Materialized repository host files were verified against the immutable Git blob manifests before edits. Inspected migration schema, customer API/credential parsing, closure, application/function registry, wallet/ledger/holds, idempotency, payment service, pool and financial specifications. Simulation account/lifecycle/publication/quota/mail stores, backup/runtime wiring, billing adapter, local-document ownership and current plans were inspected together. No opaque binary reverse engineering was needed.

| Finding | Disposition |
| --- | --- |
| Credential `application` did not participate in identity lookup; two apps sharing an issuer could resolve the same customer/wallet | Fixed startup configuration guard. Same app/issuer rotation remains valid. Real three-app identical-subject/rotation/closure regression added. |
| Issuer/app policy binding is not persisted and configuration cannot detect historical reassignment | Explicit before-second-real-app additive registry/migration gate; no claim it is implemented. |
| Old integration guide advertised unmounted legacy car/payment APIs as current | Replaced with actual private API and current/future boundary; original retained in Git history/baseline. |
| Product cloud-project storage, quota/fulfillment and compute metadata allocation was incomplete | [Canonical contract](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/architecture/data-ownership-and-cloud-lifecycle.md) defines product schemas/private objects, version/quotas/jobs/usage, Credits commercial truth and failure/closure/recovery states. These services remain unimplemented/disabled. |
| Existing foreign keys/wallet checks depend on transactional engines; migrations rely on server default | Add real-MySQL fixture assertion that all migrated tables use InnoDB. Deployed-engine verification remains required; no engine conversion/migration performed. |
| Legacy catalog lacks complete product-scoped offer/entitlement API; business-key deduplication, durable provider dispatch/refunds and multi-app spending authorization remain incomplete | Existing B04/B05 gates retained and made explicit; legacy routes stay unmounted. |
| Overlapping index prefixes, independently valid app/function FKs without a pairing constraint and missing order-currency snapshot need commercial hardening | Canonical contract records concrete candidates and future EXPLAIN/composite-scope/provenance tests; no indexes dropped or historical terms guessed. |

## Changes and validation boundary

One runtime change: reject ambiguous namespace assignments in `parseCredentials`. New tests cover rejection of cross-app issuer reuse and accidental multiple issuers within an app; valid token/permission rotation; three simultaneous app identities with equal subject; closing one app without touching others; and actual fixture table engines. No new dependency, migration, table, money mutation, paid endpoint or Atlas runtime is added. B03/B05 and deployment docs link the single canonical design instead of duplicating its schema specification.

Local pinned Node 24.19.0: all 119 unit tests and TypeScript check pass. Full exact-source CI, migrations/MySQL integration, lint/build/audit and packaging are still required; local units alone do not prove database isolation. No load, worker, merchant/payment/refund, selected-provider object semantics, live financial recovery or arbitrary-scale certification is claimed.

The default identity model is separate app wallets, not company-wide shared login/credit. Future verified linking requires explicit constraint/lifecycle migration. Preserve MySQL/InnoDB, exact ledger and current product data separation; no rewrite is justified by observed requirements. Simulation acceptance remains 19/62 (40.34%) without credit for this review.

## First CI attempt and correction

Candidate `8f697e321644b2c8c4ec891655e011a77c3a62c3`, [run 40183173688](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/40183173688): type/lint/build, 119 units, production audit and repeated migrations passed. Real MySQL had 27 passing/one failing assertion: the new information_schema query returned uppercase `ENGINE`/`TABLE_NAME`, while the typed assertion read lowercase fields. All 20 returned engines were InnoDB and the three-app isolation test passed. Correct the query with explicit lowercase aliases, matching existing schema tests; retain every engine assertion. Compose/Docker were skipped after this failure. A fresh full corrected-source run is required; this failed run does not certify completion.

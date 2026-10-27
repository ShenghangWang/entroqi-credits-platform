# Operator pricing and cost-calculator verification

Status: in_progress. Base Credits mainc19d191c1240ec74e1be12d926520745f3f62106; paired Simulation base4e200c253a30a0b8732d4490b03dd6d000eb78eb. Owner authorized editable central prices and reusable expense/profit calculation. See PR01 and actual source/CI for qualification.

Implemented: exact-string fractional AI/FX/unit costs through pinned Decimal, existing integer-money/floor review, scoped operator HTML console with server calculations, versioned MySQL draft/publication/action/audit records, idempotent/CAS edits, private own-application published reader, and preserved historical-price license verification. Reference publication explicitly cannot enable financial services. No merchant/provider request or expense is incurred by calculator use.

Local Node24.19.0:135 unit tests pass, types and lint pass at the pre-browser checkpoint; eight paired Simulation price/license tests pass and web/server types pass. The new MySQL concurrency/replay/expiry/namespace tests and real browser console workflow require clean CI because the local host denies listening/database sockets. Existing MySQL/repeated migration/Compose/Docker/audit checks remain mandatory. The bounded additional browser step uses the same pinned Playwright and signed official Ubuntu dependency setup, retaining the ten-minute total job limit. These prepared tests are not passing evidence until their run is inspected.

Actual paid quotes/orders/refunds/issuance, provider billing reconciliation, production operator credentials/access/backup restore and supported-browser/real hosting qualification remain open. Calculator results are estimates from user-entered costs. The commercial slice adds no historical Simulation task credit:19/62,40.34% remains distinct from web-release readiness.


## First complete source run

Credits6360f7e1a753c827daf5d73387f0c5b48f0c530d / run40474774981 passes every job:135 unit tests, types/lint/build/audit, actual MySQL integration and repeated migration, both Compose checks, real operator browser flow and Docker build. Downloaded artifact12720650221 matches SHA256e527819e96d591a3ee2413abb27eab24fbb91a8a85ffc93ed8a1087a43b7b643. Independently inspected report/screenshot: no page errors/external requests, exact79/99 price-history changes and40.74 AI/51.27 contribution references pass, loss cases remain visible, and tokens/results are not retained on disconnect/reload.

Visual review prompted a usability follow-up: replace the generic-expense JSON field with labeled native rows for name/category/quantity/unit/rate/currency/FX and deletion; round summary percentages to two decimals while retaining detailed server precision. Extend the actual browser case with15-CNY infrastructure expense and expected36.27 contribution. No financial formula/policy/authority changes. Qualify that follow-up source before claiming the final operator UI verified.

# Shared company identity implementation and review

Date: 25 October 2026. Status: implementation/local checks complete; exact-source full CI pending. Baseline febea064bff2406f31cd54323376c88591ce8cc3. No deployed database or real financial records were accessed.

Owner requires one company registration across Simulation and future Atlas apps, with product profiles created on first use. This supersedes the prior separate-app-customer assumption; preserve isolated legacy issuers and immutable history.

## Implemented boundary

- Explicit `identityMode: company` authorizes registered app credentials to share one stable issuer/subject and one financial customer/wallet. Missing mode remains legacy isolated. Never merge by phone/email or automatically combine old issuer wallets.
- Migration 000011 creates InnoDB namespace, app-binding and membership tables with binary IDs and composite foreign keys. Standalone startup persists issuer mode/onboarding and app/issuer ownership before serving. Token rotation preserves bindings; mode/issuer reassignment fails and rolls back.
- Company app credentials have provision/balance/unlink only. Global close is reserved to the `company-identity` credential and ordinary app close permission is refused. Unlink affects only the calling app, blocks unresolved scoped tasks/holds and conservatively blocks legacy pending orders; it never forfeits the shared balance or closes other apps.
- Company balance and closure replies identify issuer/application; Simulation checks the expected issuer and separate product/closure authority scopes. Bodies still cannot choose issuer/app/financial ID/roles. Global close retains financial tombstones and closes memberships; a fresh subject gets a fresh wallet.
- Payments, spending, catalog/entitlements and paid cloud routes remain unmounted. Central company identity still owns session verification and cross-product closure preparation; Credits cannot infer identity ownership from email or replace application data cleanup.

## Tests and review

Local Node24.19.0:120 unit tests pass; types/lint/build pass after replacing untyped response assertions with explicit test response types. The added real-MySQL scenario races12 provisions across3 apps, requires one customer/wallet, verifies local unlink/rejoin and authority-only global closure, guards nonzero balances, prevents old-subject revival, preserves fresh-subject return and rejects persisted namespace reassignment. Legacy3-app issuer isolation and all prior financial tests remain. Test cleanup now includes the three additive tables before resetting legacy tables; no live cleanup script is introduced.

Exact-source CI must still verify fresh/repeated migrations, all real MySQL cases, audit, Compose and Docker. These tests do not establish live merchant, paid API, shared entitlement, arbitrary scale or provider recovery qualification.

Canonical identity decision and deployment contract live in the [Simulation repository](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/decisions/0022-company-identity-and-lazy-product-profiles.md); [commercial delivery](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/commercial/billing-delivery.md) remains the sole commercial queue. Product acceptance remains19/62,40.34%; no paid feature is enabled.

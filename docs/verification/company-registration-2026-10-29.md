# Company registration verification — 29 October 2026

Reviewed base Credits main `b061eaede76d2eb18b18149c6d5152d9299e0af0`. Plan and owning-service contracts: [integration review](../company-integration-plan.md), [console/setup](../company-console.md). The current Atlas recursive-navigation main `a164fe8` was reconciled into its separately scoped adapter change without losing either feature. No private research or historical employer data was copied into this repository.

## Implemented

- Additive MySQL migration000013 and repeat-safe company registration of `simulation`, `atlas-simulation`, `atlas-ai`; distinct immutable product/catalog/access/price keys under `entroqi-company-v1`.
- Explicit private staff console and scoped app/customer/wallet/transaction/price reads. Product credentials cannot read staff data. Credential-scoped registration metadata cannot select another application. No employer frontend/backend dependency, copied auth store, mandatory agent hierarchy or legacy money/payment route is mounted.
- Company registration refuses foreign app rows and conflicting product/issuer ownership without deleting history. Retired employer seed command is no longer a company default and refuses non-test execution.
- Separate product credentials and private staff/pricing credentials. Atlas price inputs are unset when opened from their own app cards; there is no automatic Simulation price on either Atlas. Registration/price publication never enables commerce or paid access.

## Actual local checks

Node26.0.0/macOS, frozen `npm ci --ignore-scripts`: types, lint, **145 unit tests**, production build and zero production dependency advisories pass. **35 real MySQL8.4 integration tests** pass, including registration/repeat/conflict/ownership cases, concurrent three-app one-wallet provisioning, service/staff scope isolation, Atlas unlink independence, private field rejection and reference-price independence. A second full database run also passes. Migrations were applied twice successfully. Legacy fixture CLI refuses normal company execution before opening a database.

The separate Atlas change passes its reconciled full build/type/**23 tests**/compiled DOM/artifact checks, retains both catalog digests and keeps the backend adapter out of browser bundles. An independent local cross-repository runner uses the actual Atlas adapter, real Credits HTTP and real MySQL. It confirms canonical access-key mappings, one wallet shared by all three app clients, isolated unlink, current-session logout observation and paid access denied for both. Its central identity server is an explicit **contract fixture**; deployed central authentication/hosted SSO is not claimed.

The local company installation uses a fresh `entroqi_company_credits` database on the isolated local MySQL instance. Registration succeeds repeatedly and survives a service restart. Browser inspection confirms three registered apps, no imported customers/transactions, independent unpriced Atlas product entries and correctly selected blank Atlas price fields. The previous employer demo processes are stopped and old5174 links redirect to the company console; external databases are left unchanged. Staff tokens are cleared from inputs and remain only in page memory.

The first automated local pricing-browser attempt found the pinned Playwright headless executable absent. This is a local browser-installation failure, not passing test evidence; the actual result of its subsequent dependency repair/CI run must be recorded before a browser-suite qualification. Docker packaging cannot run locally because the Docker daemon is not available. Existing public CI retains the full MySQL/browser/Compose/Docker verification and must be inspected at the proposed source before release.

## Review limits

Local registration/private adapters are delivered; hosted company-session routes and app-local Atlas profiles still need deployment wiring. No payment, refund, paid grant issuance, protected paid content, Atlas price/duration or production rollout was activated. A new company database is intentionally empty of customers and transactions. Separate grants remain a future owning-service contract and are denied by the current adapter. Do not infer acceptance of paid service or deployed SSO from metadata, a price, a positive wallet or successful fixtures.

# Entroqi application registration and integration

Owner direction: 29 October 2026 (Asia/Shanghai). Reviewed Credits main `b061eaed` and Atlas main `8c0bb3c8`. This plan began before implementation. Owner correction later on29October requires reuse of the original full back office; [the reuse plan](full-back-office-reuse.md) supersedes the replacement-panel implementation. The previous local demo launched a historical employer console and read its databases. That is not the company's platform and must be disconnected. Preserve that external source and financial history; never import its users, passwords, wallets, orders or transactions into Entroqi.

## Product decision

Register three applications under `entroqi-company-v1`:

| Application | Product | Catalog | Independent access | Price catalog code |
| --- | --- | --- | --- | --- |
| `simulation` | AI Native Simulation Platform / `modeler-v1-local` | — | `modeler-v1-local` | `simulation:modeler-v1-local` |
| `atlas-simulation` | Computational Modeling and Simulation Atlas / `cms_atlas` | `cms` | `cms_atlas_access` | `atlas-simulation:access` |
| `atlas-ai` | Modern AI Atlas / `modern_ai_atlas` | `modern-ai` | `ai_atlas_access` | `atlas-ai:access` |

The two Atlases share their repository and renderer, not purchases. One company subject maps to one customer/wallet; each app keeps separate membership, roles, catalog, prices and eventual entitlements. Buying, refunding or leaving one never grants or removes another. A wallet balance or membership is not purchase proof. The accepted Atlas configuration already defines these identifiers. Distinct products versus price variants are also consistent with [Stripe's product/price model](https://docs.stripe.com/products-prices/how-products-and-prices-work); this is design research, not selection or activation of Stripe.

Independent charging could technically use two products inside one application. Separate applications are the better fit here because the existing Atlases already have distinct catalogues, product configuration, service scopes and access keys, and can launch independently. Keep those boundaries rather than combining their backend credentials simply because their code is shared.

## Reviewed gaps

Credits has authenticated company provisioning/balance/unlink and scoped reference pricing, but no company-wide app registry/operator overview. Its historical integration/financial/payment builders are test-only. Atlas now has two working anonymous research previews and fixed product mappings; production accounts, protected paid delivery and entitlement issuance remain absent. The former-employer console cannot be used as the company authority or data store.

## Implementation sequence and acceptance

1. Stop the historical demo processes and replace their local launcher with the original full Credits UI connected to the company's own data. Retain external databases unchanged. Use a clean, separately named Entroqi database on the existing isolated local MySQL3310 instance; never migrate former-employer data.
2. Add an additive registry schema and idempotent company registration command. Persist three application records and immutable product/catalog/access mappings. Refuse conflicting ownership/mapping; do not create prices, customers or paid grants while registering. Repeated registration must preserve history and create no duplicates. Legacy seeding is no longer a default company command.
3. Reuse the existing full Vue/ECharts back office and adapt explicitly configured scoped staff reads for registered apps, connected services, company customers/wallets, app memberships, financial history and price status. Keep staff credentials separate from product/identity credentials, scoped reads, no credential in storage/HTML, no former-employer customer or financial data, and no legacy financial/payment routes. Show registration versus runtime integration and paid readiness separately.
4. Expose credential-scoped application metadata through the existing private service. Provision separate product credentials for the three applications and an authority-only close credential. Configure pricing scopes for all three; do not invent Atlas prices or duration. Keep Simulation's approved79CNY policy distinct from live checkout.
5. Add a backend-only Atlas adapter against the documented company identity/Credits contracts. Fix product identifiers server-side, bound requests, reject redirects/malformed/cross-app replies, never cache positive sessions, never put secrets in public bundles, and deny paid access until an owning-service grant is available. The anonymous previews remain usable.
6. Verify migration/registration twice, app registry persistence after restart, one wallet across all three apps, membership unlink isolation, scoped registry/pricing/customer reads, wrong-token/forged-field rejection, safe staff output and failure handling. Run existing Credits regression plus real MySQL integration and browser checks; run Atlas full existing checks and new adapter isolation tests. Record exact results and remaining deployment/commerce gates.

## Scope and remaining activation work

This implements registration, private integration prerequisites and the local company console. No merchant account, payment collection, entitlement issuance, Atlas pricing/duration, hosted identity migration or production deployment is implied. Actual paid Atlas access must separately verify paid grants before protected content delivery; the current previews contain public research-preview material and cannot be advertised as paid protected editions. No supplier calls, budget changes or purchases are part of this change. Keep product roles independent of staff privileges and preserve all existing Simulation local-model/data guarantees.

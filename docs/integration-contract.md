# Private product integration contract

## Company account mode — current owner correction

The owner requires one registration across all company apps; [decision 0022](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/decisions/0022-company-identity-and-lazy-product-profiles.md) supersedes the separate-app-login/wallet paragraphs below for company clients. Configure `identityMode: "company"`, one stable issuer `entroqi-company-v1`, per-app tokens with `provision,balance,unlink`, and a separately held `application: "company-identity"` token with `close` only. Company onboarding is self-service. Namespace mode/onboarding and app/issuer bindings persist at standalone startup; reassignment requires a reviewed migration.

Same company subject produces one shared financial customer/wallet across participating apps; app-specific purchased permissions remain separate. `unlink` is an additional scoped `/v1/customer` action and does not delete the company account or shared wallet. Balance requires an active app financial membership; provision/rejoin is idempotent. Company balance/closure responses include trusted issuer/application acknowledgements. Global close is identity-authority-only and preserves all obligations/history; returning registration gets a new subject. No email linking or automatic merge of preexisting financial identities.

The product backend must obtain the subject from central verified-session resolution, never a browser identity body. Initial sign-in shares one HTTPS origin and private loopback session-validation service; this is not an OIDC endpoint. Before using another browser origin, implement and qualify a maintained OIDC client/provider flow. See [implementation/review](verification/company-identity-2026-10-25.md) and [deployment](deployment.md). The isolated-mode guidance below applies only to explicitly isolated legacy products. Migration000011 supplies durable namespace registration.

Current contract: 25 October 2026. This replaces the old car-sales route walkthrough as live integration guidance. The original remains in Git history and the preserved baseline; its extracted route builders are not mounted by the standalone server.

## Currently mounted API

Only `GET /health`, `GET /health/db` and authenticated `POST /v1/customer` are available. Keep them private; the product backend calls through its service credential. A public browser uses its product's authenticated account boundary, never this bearer token or a caller-selected financial ID.

```http
POST /v1/customer
Authorization: Bearer <private-product-token>
Content-Type: application/json

{"subject":"immutable-verified-product-subject","action":"provision"}
```

Actions: `provision`, `balance`, `close`, and company-mode `unlink`, each requiring its explicit credential permission. No additional body fields are accepted. The backend obtains the subject from its verified session and authorizes closure with reauthentication. Credential configuration supplies `application`, stable `issuer`, onboarding policy and allowed actions. The current database lookup is binary `(issuer, subject)`; the application label does not add another SQL key.

Provision creates one zero-balance customer/wallet or replays the existing mapping. Balance does not create an account. Replies contain internal customer/account IDs and exact decimal-string balances for the trusted backend; Simulation returns only checked balances to its browser. `close` returns `{ "closed": true }` after obligation checks, contact release and retained tombstone. Nonzero funds/holds and unresolved responsibilities block closure; old subjects cannot reprovision, and a returning signup gets a fresh subject. Product-session revocation and product data lifecycle remain the product's responsibility. Errors do not authorize retrying a paid action or changing identity.

## Legacy isolated namespaces

A missing `identityMode` or explicit `isolated` preserves an independently authenticated legacy product. Distinct applications cannot share its issuer. Token rotation retains the issuer; persisted bindings refuse reassignment. Legacy managed onboarding remains separate from company self-service. Do not merge preexisting customers/wallets by phone/email or changing configuration.

## Data ownership

The company identity authority owns shared authentication/session/verification. Products own lazy profiles/roles, projects, project permissions, cloud manifests, physical quota enforcement, jobs and worker evidence. Shared Credits owns financial identity, balances, immutable ledger and reservations/settlement; future catalog/orders/entitlements are financial extensions. Store only opaque business references and minimal necessary financial usage metadata here. Models, equations, project files, prompts, result arrays and storage-access keys do not belong in Credits.

The [canonical cross-product data/lifecycle contract](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/architecture/data-ownership-and-cloud-lifecycle.md) specifies future private object storage, product metadata schemas, quotas, purchased rights versus fulfillment, durable events, metering, closure and restore/reconciliation. Same-host operation does not authorize products to query financial tables. Keep MySQL/InnoDB and product schemas/grants isolated; current Simulation SQLite stores need no migration for this boundary.

## Unavailable paid routes and required future contract

`/integration/*`, `/billing/*`, `/payment-orders`, `/payment-callbacks/*`, `/recharge-products`, `/admin/*` and `/agents` are **not mounted** by this server. Do not expose the legacy builders, accept browser `estimatedPoints`, run car-specific seeds or treat a legacy payment callback secret as a complete multi-app authorization/payment design.

Before a paid API is introduced, derive app/payer from the authenticated scope; bind quote, business operation, hold, task, entitlement, receipt and mutation permission to it. Enforce app/payer business uniqueness independently of request retry keys; changing keys cannot duplicate a business charge. Use trusted actual usage and immutable pricing snapshots, short SQL transactions, durable outside-transaction dispatch/outbox, idempotent consumers and unknown-outcome reconciliation. Tested domain partial settlement and hold release do not implement payment refunds, paid project storage or a cloud worker.

Delivery remains the [B01–B07 commercial queue](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/commercial/billing-delivery.md), with the existing [B03/B05 hardening spec](tasks/B03-B05-lifecycle-financial-hardening.md). Catalog/payment/refund/entitlement/storage/worker/provider/race/restore gates are still open. Free local Simulation work must remain available through billing outages.

# Private product integration contract

Current contract: 25 October 2026. This replaces the old car-sales route walkthrough as live integration guidance. The original remains in Git history and the preserved baseline; its extracted route builders are not mounted by the standalone server.

## Currently mounted API

Only `GET /health`, `GET /health/db` and authenticated `POST /v1/customer` are available. Keep them private; the product backend calls through its service credential. A public browser uses its product's authenticated account boundary, never this bearer token or a caller-selected financial ID.

```http
POST /v1/customer
Authorization: Bearer <private-product-token>
Content-Type: application/json

{"subject":"immutable-verified-product-subject","action":"provision"}
```

Actions: `provision`, `balance`, `close`, each requiring its explicit credential permission. No additional body fields are accepted. The backend obtains the subject from its verified session and authorizes closure with reauthentication. Credential configuration supplies `application`, stable `issuer`, onboarding policy and allowed actions. The current database lookup is binary `(issuer, subject)`; the application label does not add another SQL key.

Provision creates one zero-balance customer/wallet or replays the existing mapping. Balance does not create an account. Replies contain internal customer/account IDs and exact decimal-string balances for the trusted backend; Simulation returns only checked balances to its browser. `close` returns `{ "closed": true }` after obligation checks, contact release and retained tombstone. Nonzero funds/holds and unresolved responsibilities block closure; old subjects cannot reprovision, and a returning signup gets a fresh subject. Product-session revocation and product data lifecycle remain the product's responsibility. Errors do not authorize retrying a paid action or changing identity.

## Multiple apps and rotation

Use a distinct stable issuer and separate service token for Simulation and each Atlas product. Configuration rejects one issuer assigned to multiple applications or onboarding policies and multiple issuers assigned to one application. Token/permission rotation within the same app/issuer is allowed. Removing an old token must not change the namespace or recreate wallets. An identical subject in different app namespaces represents different customers/wallets; no email/phone-based merge or pooled company wallet is implemented.

This check covers one supplied configuration. It does not persist historical app/issuer ownership. Before app #2 uses real financial state, implement the [durable namespace registration and migration gate](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/architecture/data-ownership-and-cloud-lifecycle.md#4-multiple-applications-and-identity). Never repoint an old issuer to a different app between restarts. Product onboarding/roles are separate from wallet balances; managed signup requires the product backend's own staff authorization.

## Data ownership

Products own authentication, projects, project permissions, cloud manifests, physical quota enforcement, jobs and worker evidence. Shared Credits owns financial identity, balances, immutable ledger and reservations/settlement; future catalog/orders/entitlements are financial extensions. Store only opaque business references and minimal necessary financial usage metadata here. Models, equations, project files, prompts, result arrays and storage-access keys do not belong in Credits.

The [canonical cross-product data/lifecycle contract](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/architecture/data-ownership-and-cloud-lifecycle.md) specifies future private object storage, product metadata schemas, quotas, purchased rights versus fulfillment, durable events, metering, closure and restore/reconciliation. Same-host operation does not authorize products to query financial tables. Keep MySQL/InnoDB and product schemas/grants isolated; current Simulation SQLite stores need no migration for this boundary.

## Unavailable paid routes and required future contract

`/integration/*`, `/billing/*`, `/payment-orders`, `/payment-callbacks/*`, `/recharge-products`, `/admin/*` and `/agents` are **not mounted** by this server. Do not expose the legacy builders, accept browser `estimatedPoints`, run car-specific seeds or treat a legacy payment callback secret as a complete multi-app authorization/payment design.

Before a paid API is introduced, derive app/payer from the authenticated scope; bind quote, business operation, hold, task, entitlement, receipt and mutation permission to it. Enforce app/payer business uniqueness independently of request retry keys; changing keys cannot duplicate a business charge. Use trusted actual usage and immutable pricing snapshots, short SQL transactions, durable outside-transaction dispatch/outbox, idempotent consumers and unknown-outcome reconciliation. Tested domain partial settlement and hold release do not implement payment refunds, paid project storage or a cloud worker.

Delivery remains the [B01–B07 commercial queue](https://github.com/ShenghangWang/ai-native-simulation-platform/blob/main/docs/commercial/billing-delivery.md), with the existing [B03/B05 hardening spec](tasks/B03-B05-lifecycle-financial-hardening.md). Catalog/payment/refund/entitlement/storage/worker/provider/race/restore gates are still open. Free local Simulation work must remain available through billing outages.

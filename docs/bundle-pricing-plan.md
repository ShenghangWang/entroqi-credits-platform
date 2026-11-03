# Company app bundles

Owner direction and implementation plan, 3 November 2026 (Asia/Shanghai). This supplements the subscription contract; permanent licenses remain closed to new sales. Status: implemented locally; final regression and source packaging are being recorded. Real checkout remains disabled.

## Reuse research before implementation

Official sources reviewed on 3 November: [Stripe multiple-product subscriptions](https://docs.stripe.com/billing/subscriptions/quantities), [Stripe coupons](https://docs.stripe.com/billing/subscriptions/coupons), [Stripe Node SDK](https://github.com/stripe/stripe-node), [Paddle discounts](https://developer.paddle.com/build/products/offer-discounts-promotions-coupons/) and [Paddle Node SDK](https://github.com/PaddleHQ/paddle-node-sdk). Stripe supports invoice line items and product-restricted discounts; Paddle supports product/price restrictions and recurring discounts. Their restrictions select discountable items, rather than proving that a customer purchased exactly the required combination. Inference: our server must enforce combination eligibility before using either provider's SDK for collection. Stripe's SDK is MIT; Paddle's is Apache-2.0. Retain their notices if adopted. No SDK is installed until a merchant/provider is selected and qualified. Do not build a new checkout, card vault, recurring scheduler, tax engine or webhook-signature algorithm.

Reuse existing Credits identity, MySQL transactions, immutable subscription prices, calculator/cost review, idempotency, named staff permissions/audit, per-app contracts and verified-settlement port. Reuse the original Vue console. The small required addition is combination eligibility and an atomic multi-line quote/fulfilment coordinator. REA is unnecessary: all owning source and public APIs are available for direct inspection.

## Contract

- Users choose a set of 2–32 distinct registered apps and one common monthly/quarterly/yearly/two-year period. Match an exact combination plus period; never silently apply subset discounts or stack offers. Unconfigured combinations have zero discount. Apps come from the reviewed company registry, not three hard-coded checkboxes. New app onboarding still requires identity, product, pricing and closure qualification.
- Owners edit a percentage discount (0–99%, two decimal places), availability and evidence note for each combination/period. Save an immutable draft, then separately review and publish against the expected published revision. A published disabled rule withdraws future discounts. Drafts and publication are attributable in the existing audit log. Scope must include every member app.
- Server alone reads current published component prices, computes integer-fen allocations using largest remainders and checks each discounted line against its existing calculator/cost floor. A rule never makes an unavailable, expired or uneconomic plan eligible. Preserve full-price components, discount allocation, rule version and price versions in an immutable quote. No customer-supplied amount or discount is accepted.
- Bundle quotes last at most 15 minutes and use the earliest component/rule expiry. Concurrent price changes cause review/retry. A quote is bound to the stable company subject. It creates no trial, paid access, app profile or automatic charge. First purchase starts now; renewals require aligned existing coverage across the selected apps. Unequal coverage requires explicit reconciliation; no hidden proration, duplicate billing or sacrificed paid time.
- One verified aggregate settlement atomically creates ordinary per-app grants and relational subscription terms. All apps keep using their existing access check. Never create a global premium flag. Refund the complete bundle atomically; partial refunds and mid-cycle changes remain unavailable until a separately reviewed provider/proration policy exists. Failed or replayed events cannot leave partial rights or resurrect refunds. One provider receipt is transactionally bound to one purchase across both single-app and bundle sales, including historical single-app receipts. A line cannot be settled independently of its bundle.
- The shared Simulation account UI hosts the one bundle chooser; both Atlas apps link to that configured company path. Backends keep scoped credentials private. Same-origin/session/identity-change protections are inherited. Public preview reveals only published commercial metadata, never costs, credentials, account details or drafts.

## Sequence and proof

1. Record this plan and matching Simulation/Atlas guidance before code.
2. Add additive version/quote tables; preserve all existing history and rollback guards.
3. Implement exact matching, money allocation, draft/publish/withdraw/audit and cost review.
4. Coordinate quotes and verified settlement through existing contract records, then wire shared buyer and original operator UIs.
5. Test real disposable MySQL/HTTP, simultaneous/replayed events, isolation, renewal, refund, closure, stale rules/prices, scopes and fourth-app data-driven rules; run relevant app/browser/package regressions.
6. Record source-specific evidence and update release priorities. No test fixture qualifies a merchant, physical device, real email, production hosting or independent user acceptance.

## Pinned SDK inspection and implementation decision

| Candidate | Reviewed source | License / compatibility | Decision |
| --- | --- | --- | --- |
| Stripe Node 23.1.0 | `6d5ed967d602224ac3056dc3f0befbb55487ee50`: Coupons, Subscriptions and webhook verification tests | MIT, Node >=20; compatible with pinned Node24 | Reuse official collection/signature components if Stripe is selected; no unused runtime dependency now |
| Paddle Node 3.10.0 | `5afd10b715a71fdd82691cebecad23f1b162df3c`: discount resource and webhook helper | Apache-2.0, Node >=20; retain license/NOTICE obligations if adopted | Reuse official collection/signature components if Paddle is selected; merchant eligibility and currency/tax behavior need actual qualification |
| Existing Credits | Fastify5.12.7, mysql2 3.23.1, decimal.js10.6.0, existing subscription/calendar/settlement services | Existing pinned private project and notices | Adapt directly; no new framework, duplicated console, card vault or recurring engine |

The inspected SDK resources expose provider discount/item operations; exact app-set eligibility remains our small server-owned policy. No provider SDK can substitute for company identity, per-app authorization, calculator cost review or our acceptance/publication audit. Source-file SHA256 observations are in `verification/bundle-sdk-research-2026-11-03.json`; these are direct-source observations, not a live SDK integration claim.

## Operations and extensibility

Apply additive migration `000017_company_bundles` after an owner-controlled private database backup. It creates rule/version, aggregate quote/payment and relational quote-item tables; existing prices/grants are not rewritten. Keep aggregate parents, quote items and ordinary grants together in backups. Never roll back or delete historical tables with purchases in them. Restore/reconcile into a fresh environment rather than dropping financial history.

Give the existing Simulation company commercial credential the explicit `bundles` capability for the shared BFF. It allows reading public company offers and accepting a verified-subject aggregate quote; it does not allow publication, identity closure or settlement. Atlas credentials remain scoped to their own app. Route `/api/billing/*` to the existing Simulation authority, and configure `ATLAS_COMPANY_PLANS_PATH` to its real same-origin page with `?account=bundles` (for example `/simulation/?account=bundles`). Leave it unset in the standalone static preview. The selector derives products from the registry; new app onboarding adds a reviewed mapping plus qualified adapters/closure/prices, never combination-specific code.

Quotes and grants are separate records. At most20 unexpired bundle quotes per company identity are allowed. Selection is bounded at32 apps, common period is1/3/12/24months, public response reads are bounded at256KiB, and existing trusted ingress/concurrency/timeouts remain enforced. Discounts use deterministic ASCII ties and integer-fen conservation. Rule history returns current draft/published heads (bounded2048rows); a larger operational catalog needs a reviewed paginated staff view. Do not enumerate every possible combination.

Each manual renewal accepts its current reviewed quote. Already-paid amounts/dates and previously accepted unexpired quotes are immutable. Different existing expiry dates, partial bundle refunds, partial cancellation and mid-cycle proration require future explicit provider-supported reconciliation; the first release refuses them rather than losing paid time. Trials stay per-app, explicitly requested, never started by selecting a bundle.

# First web release: finance handoff,30October2026

The owner has not chosen a final price, billing model or trial policy. The clean company database therefore has three applications and no published commercial offers. The original full Credits back office is the only finance UI. Open `/back-office`, then **定价与收费方案**. `/v1/platform` and `/v1/pricing` are compatibility redirects; their obsolete panels are deleted.

## Owner and manager workflow

1. Select Simulation Platform, Simulation Atlas or Modern AI Atlas. The two Atlases are separate products and purchase rights, although customer identity and wallet are shared.
2. Enter a candidate CNY price; choose monthly/manual renewal or a lifetime license for one exact software version/Atlas edition. Current app identifiers are Simulation `v1` and Atlas `2026.10-demo.1`. Future versions need their own specified rights. Lifetime excludes all future upgrades, unlimited hosting, compute, AI and support.
3. Choose free trial on/off and, if on,1–365days. Thirty days is an editable suggestion. Viewing a price never starts a trial; a formal trial requires an explicit authenticated action after hosted activation. Trial expiry never charges a card.
4. Enter per-charge-unit labor, supplier/compute/storage/trial/AI costs, rates, FX, payment/tax/refund reserves and volume/fixed-cost assumptions. The existing server calculator computes exact costs, contribution, margin, profit and break-even. These are forecasts, not actual revenue. A paid quote/trial requires current eligible cost evidence, including a positive labor allocation under the existing policy.
5. Save an immutable draft. Review its model, version, trial, costs and change reason, then explicitly publish. Apps read current safe terms through their own backend; caches are bounded to ten seconds. Publication alone does not open payments.

Publication changes future offers. Existing version licenses, paid monthly periods, accepted quotes and started trials retain their original snapshots. A new price, version, unlink/rejoin or offer toggle cannot restart trial eligibility. Staff need explicit read/write/publish pricing permissions for their own app scopes. Optional agents remain preserved and off by default; they cannot edit pricing.

## What is implemented and checked locally

- Original Vue/Naive UI/ECharts dashboard, tables and charts; one HttpOnly staff login for calculator and product plans. Itemized CNY/USD/AI calculations use the existing backend.
- Additive MySQL migration000014, immutable draft/publication history, exact amounts, optimistic locking, retry keys, strict service/staff scopes and server origin checks.
- Transactional per-company-subject/per-product trial history, accepted quote snapshots and active access resolution for exact-version lifetime and bounded monthly coverage.
- Trusted verified-settlement writer with replay/conflict/refund controls. It has no public HTTP grant endpoint or permissive default verifier. Fixtures do not prove a real provider integration.
- Original plan chart and product-sales metrics read verified receipts and active paid plans. Empty company data stays empty; no customers, sales, credits or chart segments are fabricated.
- Simulation and both Atlas app readers and displays consume current price/model/trial metadata. Their original simulation engines, research catalogs, previews and old signed license contracts remain preserved.

See [verification evidence](verification/flexible-finance-2026-10-30.md). Public backend CI verifies the browser session/API contract. Actual private original-Vue UI verification separately requires the private built console; public CI cannot claim it built that private source.

## Remaining release gates

| Area | Required before activation |
| --- | --- |
| Domain, TLS and host | Owner-selected domain/region/operating cap; same-origin app/staff reverse proxies; private service ports; durable storage; exact-source release CI and actual hosted browser tests. A purchase alone is not qualification. |
| Company identity and recovery mail | Configure the existing shared company authority and sender, verify real delivery/reset, enroll the owner recovery address and keep its separate offline recovery code. The staged address is unverified; no sender is configured. Protected server-admin recovery remains available. |
| Payments and monthly renewal | Select merchant/provider; connect its maintained verified SDK/adapter to quote snapshots; qualify signatures, amount/currency/subject binding, durable callbacks/replays, renewal period continuity, cancellation, refunds and reconciliation. Monthly currently means manual renewal. No mandate, automatic renewal or post-trial charge exists. |
| Paid version delivery | Qualify durable recoverable browser-version delivery and migration of any legacy formal trials/signed grants before turning paid gates on. A central ledger record cannot guarantee perpetual hosted availability. |
| Atlas paid content | Deploy the private company backend and real access enforcement before protected catalogs are sold. Current public research-preview assets stay previews. Static hosting alone does not provide a private identity/commerce service. |
| AI and cloud compute/storage | Owner-approved provider/model, operating cap and qualified metering/receipts, isolation, consent and restore/backup checks. No paid AI/compute is enabled by a price or subscription switch. Existing local work stays on the user's device. |
| Operations and human acceptance | Selected-host stopped backups and clean restore drill; service/support details; actual OS/browser/file-picker/campus tests and reviewed lessons/rights/volunteer walkthroughs where required by the Simulation release plan. |

The separate private Simulation acceptance ledger and its deferred/human/operational criteria remain unchanged. Finance implementation does not increase product acceptance or make the wider release ready. Existing feature PRs are separate work and are not silently merged by this handoff. No new purchase, email transmission, paid service activation or remote production deployment has occurred.

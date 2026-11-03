# First web release: subscription finance handoff,30October2026

The owner selected monthly, quarterly, yearly and two-year subscriptions, removing new permanent/version-license sales. Final prices, enabled periods and trial policy remain undecided. The clean company database has three apps and no published commercial offers. The original full Credits back office is the only finance UI: `/back-office/pricing` (**定价与收费方案**). `/v1/platform` and `/v1/pricing` redirect; their obsolete panels are deleted. Optional agents remain preserved and off by default.

## Owner and manager workflow

1. Choose Simulation Platform, Simulation Atlas or Modern AI Atlas. The Atlases are separate apps and purchase rights with a shared company identity.
2. Choose monthly, quarterly, yearly or two-year. Enter the **total CNY price for that full1/3/12/24calendar-month period**, independently from other periods/apps. New purchases do not require a licensed software version.
3. Set availability and optional free trial (off or1–365days). Thirty days is an editable suggestion. Trial eligibility is once per company identity/app across all periods. Viewing prices never starts a trial; expiry never charges automatically.
4. Use the existing itemized calculator for supplier/compute/storage/trial/AI costs, labor, FX, fees/tax/refund reserves, volume and fixed-cost assumptions. Enter costs for the selected full period. Forecasts are not recognized revenue or normalized MRR. Eligible quotes require current approved cost evidence.
5. **仅保存草稿** saves without applying changes. **审核并发布价格** opens a review showing app, period, total and availability. Supply a reason, tick the confirmation and click **确认发布价格并生效**. The server checks permissions, immutable revision, retry key and expected published head. Apps refresh published metadata within their ten-second cache.
6. To remove a period, use **停售此周期方案**, review, and **确认停售并生效**. Canceling or merely saving never withdraws it. The remaining periods keep their own prices. Re-enable through another reviewed publication. No purchased record is deleted.
7. **客户订阅记录** lists real per-customer app, interval, paid total, start/end and status, with scoped pagination. An empty installation honestly shows no contracts.

Publication affects future offers. Each verified purchase stores its accepted immutable price/terms, company issuer+subject, app, exact CNY amount, interval and UTC dates in MySQL. Calendar renewal retains its original day across short months/leap years; early renewal queues after paid coverage. Refunds stop the affected right. Price changes or withdrawals cannot shorten existing paid periods or restart trials. Staff need explicit read/write/publish permissions and app scopes; product service credentials cannot publish prices.

## Implemented and checked locally

Original Vue/Naive UI/ECharts layout, charts, role/agent features and one HttpOnly staff login are reused. The calculator uses the existing exact-decimal backend. Additive migrations000014–000016 retain financial history and add transactional trials, quotes, receipts and indexed relational subscription contracts. Old permanent grants remain readable for historical commitments, with no new sale path.

The trusted verified-settlement writer binds quote/payment/customer/amount/period, prevents replay/conflicting or overlapping fulfillment and preserves refund outcomes. It has no public grant endpoint or permissive verifier. Fixtures do not establish a live provider integration. Original dashboard metrics read verified receipts/paid records, never fabricated sales.

Simulation and both Atlas readers/display paths accept the safe four-plan contract; the Atlas existing company study backend also serves its public offer proxy without creating another auth store. Latest Atlas research, frozen digests, notes/history and resizable inspector remain intact. See [source-bound verification](verification/subscriptions-2026-10-30.md).

## Remaining release gates

| Area | Required before activation |
| --- | --- |
| Domain, TLS and host | Owner-selected domain/region/cap; same-origin routing; private service ports; durable storage, exact-source release CI and actual hosted browser tests. |
| Company identity and recovery mail | Existing shared authority plus sender; real delivery/reset/lifecycle tests; verified owner recovery enrollment and offline recovery code. Staged email remains unverified without a sender. Protected server-admin recovery remains available. |
| Payments and renewal | Maintained provider SDK/verified adapter, merchant credentials, signed exact quote binding, callbacks/replays, refunds/reconciliation and calendar continuity. All four periods currently use **manual renewal**. No automatic mandate or post-trial charge exists. |
| Atlas paid content | Same-origin company backend and actual private catalog/access enforcement before paid content sales. Existing public research previews remain previews. |
| AI, cloud compute/storage | Approved provider/model/budget, metering, isolation, explicit consent and backup/restore qualification. A subscription never enables these implicitly. |
| Operations and acceptance | Chosen-host backups/clean restore, monitoring/support, real OS/browser/file-picker/campus checks and reviewed lessons/rights/user walkthroughs required by the existing product plans. |

New subscriptions do not promise permanent hosted software delivery. Historical signed rights and version recovery remain preserved where relevant. The private Simulation acceptance ledger and deferred/human/operational criteria are unchanged; this is verified local engineering, not a production-ready or deployed release. Separate feature PRs remain separate. No live payment, paid API call, purchase or cloud deployment occurred.

## Owner administration update31October2026

Use `/back-office/owners` for separate co-owner logins and attributed price/security records. [Owner administration](owner-administration-and-audit.md) describes explicit reauthentication/confirmation, scope inheritance, recovery and current signup-adapter limits; [verification](verification/owner-administration-2026-10-31.md) records179unit/50MySQL and actual original-Vue browser checks. Apply additive migration000017 with the full protected staff/audit backup. This preserves all deployment/payment gates above.

## Multi-app bundles, 3 November 2026

The owner now authorizes configurable exact-combination discounts. Open **定价与收费方案 → 多应用组合优惠** in the same original back office. Choose the full app set and period, enter a discount percentage, availability and review evidence, save a draft, then separately review/confirm publication. Configured combinations can be listed/reopened. To stop an offer, publish a disabled discount revision. Existing accepted quotes and paid periods remain intact. Unconfigured combinations have no extra discount. Each discounted line must still pass its original calculator review.

Consequential changes show the named operator, time, exact combination/period, reason and before/after discount in **所有者与操作记录**. Customer subscription rows retain per-app paid amount/expiry and show their aggregate bundle quote/discount. Collection remains disabled; no real business prices/discounts were chosen. See [bundle plan and SDK research](bundle-pricing-plan.md). The current company-wide release sequence is in Simulation `docs/operations/company-first-web-release-2026-11-03.md`.

## Final local evidence, 3 November 2026

Simulation verification `docs/verification/company-bundles-2026-11-03.md` records612Simulation tests,181Credits unit/62MySQL tests,51Atlas tests, original console regression, root and `/simulation/` integrated browser/API workflows, and package relocation/restore proof. Snapshot/receipt reuse and concurrent-overlap regressions pass. Production hosting/mail/AI/merchant, physical-device/user/expert and off-host restore qualification remain separate. No real prices, discounts or payments were activated.

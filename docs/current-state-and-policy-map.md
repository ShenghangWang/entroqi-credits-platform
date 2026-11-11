# Credits source and policy map

Organized12 November 2026. This is the current standalone implementation/status authority and document library. [AGENTS](../AGENTS.md) owns agent behavior; [first-web readiness](first-web-release-readiness.md) owns finance workflow and remaining activation gates. Existing task specs are bounded execution records, not another company backlog.

## Resume baseline and evidence

At the fetched November 12 inventory, integrated main is `578a396e21949c0b1f1af7158e93d2e9aaefc45f`, with backend and original `back-office/` together. Its tracked runtime tree equals the compatible company pin `ffa9239`. No open runtime PR was observed; this guidance organization is a documentation-only branch/descendant. Refresh actual heads/PRs/local changes/stashes/worktrees before choosing source. Do not interpret this dated snapshot as permission to overwrite later unique work or retire retained refs.

The original console history through `64275f2` is already imported without squashing; the old standalone repository is a provenance archive. Reuse the maintained original UI and policies. The original extraction commit and manifests retain provenance; never rerun extraction over adaptations or start another console/auth/billing implementation.

Existing [main validation41842809609](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/41842809609), [dependency review](verification/dependency-review-2026-11-04.md) and dated records below identify their tested source. The November 10 company review also exercised this unchanged Credits runtime (186 unit/64 MySQL tests and original-console workflows); private coordination artifacts stay in their owning private repository. These are dated results, not November 12 reruns. Reuse only matching source/dependency/configuration/schema/harness/environment evidence. New live service operation requires its own actual observations.

## Mounted, retained and gated behavior

| Policy/feature | Owning implementation | Current standalone distinction |
| --- | --- | --- |
| Owner/Admin/Agent hierarchy and creation rules | `src/back-office/account-creation-policy.ts`, original `back-office/src/policies/` | Preserved rules/forms. Staff-assisted creation and editable policy persistence still need company-identity/audit adapters; no second customer-password store |
| Staff sessions/scopes and optional agents | `operator-source.ts`, `operators.ts`, `routes.ts`, `data.ts` | Server enforced. Agents default off and approved subject/referral scopes remain required |
| Independent owners and important-action history | `staff-administration.ts`, `administration-routes.ts`, `audit-trail.ts` | Implemented reauthentication, protected authority/outbox and attributed before/after price/bundle history |
| Owner credential/email recovery | `owner-recovery*.ts`, protected CLI and mail port | Implemented preparation; actual enrollment/sender/recovery operations require qualification |
| Calculator, four subscription periods and trials | `pricing/`, original pricing page | Implemented draft/review/publish/withdrawal and app/customer/calendar contracts; business terms remain operator-reviewed; no new permanent sales |
| Exact-combination discounts and per-app rights | `bundle-rules.ts`, `bundle-service.ts` | Implemented cost floors, immutable quotes, atomic fixture fulfilment/refund and ordinary per-app rights; real collection remains gated |
| Late settlement versus company closure | `pricing/commercial-service.ts`, lifecycle transactions | Current customer status checked under the same locks; delayed paid events cannot create rights after closure; retained refund/replay does not resurrect access |
| Legacy point adjustments/promotions/commissions/settlements | Retained domain services and original forms | Not mounted as arbitrary production money writes; applicable identity/audit/merchant gates remain |

The frontend displays actual server capabilities. Browser-local switches are not saved company policy; disabled controls and forged requests must remain unavailable/server-denied. The production entry point is the authenticated private service, not historical caller-identity/payment builders. Company signup, product roles, financial staff and paid rights remain separate; membership/wallet balance/agent status is not purchase proof.

## Document library and ownership

| Need | Stable reference |
| --- | --- |
| Current owner workflow and release gates | [First-web readiness](first-web-release-readiness.md) |
| Identity and financial service boundaries | [Integration contract](integration-contract.md), [service boundaries](architecture/service-boundaries.md) |
| Subscription/trial/calendar rules and calculator | [Offers and console](flexible-offers-and-console.md), [subscription periods](subscription-periods.md), [cost/margin policy](architecture/paid-offer-margin.md) |
| Exact-set bundle rules and reuse | [Bundle contract](bundle-pricing-plan.md) |
| Original frontend ownership/provenance | [Console README](../back-office/README.md), [console AGENTS](../back-office/AGENTS.md), [reuse record](full-back-office-reuse.md) |
| Operator sessions and capabilities | [Company console](company-console.md), [owners/audit](owner-administration-and-audit.md) |
| Deployment, data and recovery commands | [Deployment](deployment.md), [credential recovery](developer-account-recovery.md), [email recovery](owner-email-recovery.md), [migrations](../migrations/README.md) |
| Verification scope and running cost | [CI policy](ci-policy.md), source-specific `verification/` records |
| Existing bounded specifications | [B02/B03 identity](tasks/B02-B03-private-identity.md), [B03/B05 lifecycle](tasks/B03-B05-lifecycle-financial-hardening.md), [PR01 pricing](tasks/PR01-operator-pricing-and-costs.md); reconcile with mounted state before selecting remaining work |
| Historical integration/extraction rationale | [Registration sequence](company-integration-plan.md), [original host-app executable plan](reusable-credits-console-executable-plan.md), [extraction evidence](verification/extraction-2026-10-23.md) |

Keep status here, actual activation decisions/gates in first-web readiness, commands in runbooks and dated results in verification. Do not append a new global queue to each document. Historical `phase complete`, prices, missing-feature lists and next tasks retain their original dates; later subscription/source-consolidation decisions supersede them. Preserve original financial rules and already-paid rights while enforcing current server scope.

## Preserve and qualify changes

Public source is owner-authorized; operational credentials/data and private Simulation/Atlas source/research/logs remain private. Do not copy private company coordination records into this public repository. Use reviewed service contracts, not cross-product SQL or another auth store. Keep original console/history, both lockfiles, schema/financial history and source/role boundaries intact.

For guidance-only changes verify links/anchors, authority/current-history labels and source/lock/schema/policy preservation. Reuse dated matching runtime results instead of repeating unchanged MySQL/browser/container suites. For changed source/config/dependencies/migrations/financial behavior retain the full applicable existing checks, with sequential disposable DB fixtures. Runtime promotion and live merchant/provider/sender/host/off-host-restore/device acceptance are separate from a documentation edit. No new spending, source-visibility change, price publication or feature activation is inferred.

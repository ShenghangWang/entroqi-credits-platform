# Credits source and policy map

Current review baseline, 4 November 2026: canonical main is `c1b2faca46924e982ee95bd8ca7ae7e92c747cdc` before the settlement correction. The historical remote inventory at the start of the earlier integration had only main `b061eaede76d2eb18b18149c6d5152d9299e0af0`; that baseline remains an ancestor. Always fetch and compare current main/branches before editing; this dated inventory does not describe future remote state. Preserve local work rather than blindly pulling over it.

The older [executable plan](reusable-credits-console-executable-plan.md) is a historical reference to the original host application's Phase8 work. It is valuable policy/provenance material, not proof that every original endpoint/schema is mounted in this standalone service. Preserve it and the extracted implementation; never replace the original console or introduce another customer password authority.

| Policy / feature | Owning implementation | Current standalone state |
| --- | --- | --- |
| Owner/Admin/Agent hierarchy and creation rules | `src/back-office/account-creation-policy.ts`, original private Vue policy helpers | Preserved rules. Staff-assisted creation and editable policy persistence still require the company-identity adapter; no second password store |
| Staff authentication, scopes, optional agents | `operator-source.ts`, `operators.ts`, `routes.ts`, `data.ts` | Enforced on the server; agents default off and approved-subject/referral scopes remain required |
| Independent named owners and important-action history | `staff-administration.ts`, `administration-routes.ts`, `audit-trail.ts` | Implemented with reauthentication, protected authority file/outbox, before/after pricing and bundle history |
| Owner credential/email recovery | `owner-recovery*.ts`, protected CLI and verified mail port | Implemented preparation; private enrollment/sender and operational verification still required |
| Calculator, four subscription periods, optional trials | `pricing/` and original console pricing page | Implemented draft/review/publish/withdrawal and per-customer/app contracts; no new permanent sales |
| Exact-combination discounts | `bundle-rules.ts`, `bundle-service.ts` | Implemented server pricing, cost floors, atomic fulfilment/refund and per-app rights; collection remains disabled |
| Legacy point adjustments, promotions, commissions and settlements | Retained domain services and original forms | Not mounted as production money writes; merchant/identity/audit qualification required |

The frontend must display actual server capabilities. A switch that merely changes browser memory must not appear to have saved a company policy. Unconnected policy edits and provisioning submits must be visibly unavailable while the original forms/rules remain preserved. An optional-agent flag never activates money movement or purchased product access.

## Repository organization work

The current request authorizes publishing the reviewed company work. Keep the existing public Credits core public and private Simulation/Atlas/console source private. The original Vue console is maintained at private `ShenghangWang/entroqi-credits-back-office`. Simulation's private `company.release.json` pins companion commits; its canonical roadmap/technical plan and existing repository runbook provide current guidance and setup/verification commands. The operator component remains the original interface. Never copy private Simulation/Atlas/Vue source into the public Credits tree or its Actions artifacts.

Review/publish related checkpoints, verify exact remote SHAs and preserve historical/recovery branches. Merge only source with matching successful verification. Retain the existing full CI commands; remove duplicate automatic events rather than dropping checks. Verify actual included CI allowance privately before required runner use; paid budgets remain unchanged. A missing CI result is not release acceptance.

## Settlement and company closure

Single-product and aggregate verified payment settlement must read the current customer status under the same identity/user transaction locks as company closure. A delayed paid receipt cannot create rights for a closed customer. Failed settlement rolls back event and receipt claims; exact committed event retries retain their original idempotent response. Retained closed-customer history can still receive refunds, without resurrecting access. The actual MySQL regression covers all three applications and refund/replay after closure; live merchant activation remains separately qualified.

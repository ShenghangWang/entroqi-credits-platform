# Credits platform instructions

Updated 12 November 2026. This public repository owns the Credits service at `src/` and the original Vue/Naive UI/ECharts console at `back-office/`. Read [README](README.md) → [current source/policy map](docs/current-state-and-policy-map.md) → the selected existing contract/spec/runbook. Read [console-specific instructions](back-office/AGENTS.md) before UI work.

## Resume without repeating or overwriting work

Fetch without pruning; inspect actual main/branches, open PRs, local/untracked changes, stashes, worktrees and unpushed commits. A dated source inventory is not live state. Preserve unique work before switching or reconciling; do not reset/clean, force-push, replace a newer snapshot or delete branches to tidy docs. Continue compatible existing work on a scoped reviewed branch; verify remote SHA after publication. Keep code review/promotion separate from a documentation cleanup.

The source/policy map distinguishes mounted/qualified behavior from retained historical forms/services and unverified live activation. Incomplete merchant/identity/host evidence is not permission to rebuild the original console or duplicate implemented billing. Preserve all original imported console commits, the extraction/reuse manifest and maintained adaptations. Never rerun extraction over them. The standalone `entroqi-credits-back-office` is an archive, not a current development checkout.

## Service, policy and privacy boundaries

- Company identity owns customer signup/passwords/sessions/global closure. Credits stores immutable issuer/subject mappings, scoped memberships, wallets, accepted offers/quotes/contracts, settlement/refund history and audit. No second customer-password authority, email-based merging or direct product/auth database writes.
- Product roles, financial staff scopes and purchased access are distinct. Wallet balance, an account or another app's entitlement never grants access. Agent mechanisms remain optional/off by default; unmounted policy/provisioning/money actions stay visibly unavailable and server-denied.
- New offers use independently reviewed/published1/3/12/24-calendar-month subscriptions per app, optional once-per-app trials and reviewed exact-set bundle discounts. Preserve existing paid terms/history, refunds, close controls and legacy grants. Do not revive historical new lifetime/version sales, hardcode old prices/trials or make a draft take effect without confirmation.
- Preserve exact-money/integer-fen/calendar/idempotency and transaction-lock semantics. Delayed paid events cannot grant rights after closure; retained refunds/replays cannot resurrect identity/access. Live money writes require their existing verified provider/merchant/audit/reconciliation gates.
- The authenticated private server is the production entry point. Historical caller-identity/payment/host-app builders are test-only; their retained code is not live capability. Private service/operator/database credentials and operational data never enter Git, browser storage or public artifacts.
- Public Credits source is owner-authorized; it grants no license or production exposure. Never copy private Simulation/Atlas source, research, logs, prompts, company coordination evidence or credentials into this repository. Refer to owned service contracts and record upstream dependencies instead.

## Documentation and verification

The [source/policy map](docs/current-state-and-policy-map.md) owns current standalone status and the document library. [First-web readiness](docs/first-web-release-readiness.md) owns finance workflow/release gates; existing task specs describe their bounded work, not another company queue. Runbook commands stay in deployment/recovery/console guides; dated verification remains dated; the old host-app executable plan is historical policy provenance only.

Update the relevant existing contract before runtime changes and current status/evidence afterward. Preserve acceptance/financial rules and source history. For documentation-only work, check Markdown/navigation, current-versus-historical labels, ownership and preserved source/lock/schema/policy trees. Reuse matching source-bound runtime evidence instead of rerunning unchanged type/unit/MySQL/browser/container suites. Documentation-only source descendants must not be described as having been tested by an older runtime CI head. Canonical runtime/configuration/dependency/schema/policy changes still need relevant full existing checks; diagnose failures before retrying.

Use the committed locks and supported pinned Node runtime for actual fresh/changed setup. Database fixtures require an explicitly isolated disposable schema and run sequentially; never point them at production/company/former-employer data. Preserve both backend/frontend build and security checks. Follow [CI policy](docs/ci-policy.md); no new paid runner, budget, visibility change, merchant/provider activation, external outreach or purchase follows from this organization.

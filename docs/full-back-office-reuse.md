# Restore the original full Credits back office

Owner correction,29October2026: reuse the existing full Vue back office, including its original chart/table/dashboard structure and Developer/Admin/Agent views. The small replacement panel was an incorrect implementation choice. This correction supersedes the new-panel portions of the earlier company integration plan. Keep the three company app registrations, independent Atlas access and separate company data.

## Reuse and adaptation

The original `BackOfficeLayout.vue`, `credits-admin/index.vue`, login, dashboard component, API DTO/normalizer functions and account-creation policies are extracted directly from the owner's original workspace. The reusable slice lives in the sibling private `back-office` workspace, with hashes and exact source paths in `reuse-manifest.json`. It contains no source `.env`, old database rows, model-generation provider code or employer assets. The API client is an AST dependency extraction of the original functions, not a rewritten display. Visual/chart/table and form code is retained; only company catalog/branding and service/session adapters change.

Keep Vue, ECharts, Naive UI, Pinia and Iconify. Pin and audit dependencies; adapt compatible security fixes without replacing these components. Bundle the existing icons locally. Serve the production build via `CREDITS_CONSOLE_DIRECTORY`, behind the same private service. `/back-office` is the real console; earlier `/v1/platform` URLs redirect there. No simplified replacement shell remains the default.

The private adapter validates a compiled-build snapshot before listening: regular files only, no symlink files/directories, at most128asset entries,256KiB HTML,4MiB per asset and16MiB aggregate. Browser URLs select exact in-memory assets, never filesystem paths. An invalid build leaves the console unavailable; the private finance API remains separate. Restart the service after publishing a new build. This reuses the existing interface and Node file primitives; see the [security review](verification/dependency-review-2026-11-04.md).

## Identity and optional agents

The console's operator login exchanges a dedicated configured staff credential for a short-lived HttpOnly/SameSite session. It is a private staff control plane, not another customer signup or password database. Browser storage never receives long-lived product/identity/operator credentials. Staff roles are server-resolved; only explicitly scoped staff can browse the company data.

Regular product users continue self-registration through the one existing company authority. They need no Agent or invitation. Preserve the original agent approval/relation/commission/settlement domain services and optional UI/policy source. `CREDITS_AGENT_WORKFLOWS_ENABLED` controls use of agent staff sessions; default off. Agent identity must bind to a verified company subject and approved agent profile before financial data can be scoped to referred users. Neither an Agent role nor staff privileges grants product purchases.

The existing core remains responsible for ledger arithmetic, locking, idempotency and agent commission transitions. Until the owning company-identity and merchant/settlement interfaces are configured, corresponding mutations must fail closed and explain the missing integration; do not silently create a second password store or issue payments. No legacy caller-supplied-identity/payment HTTP builder is revived.

## Payment SDK review

The official [Alipay OpenAPI SDK](https://github.com/alipay/alipay-sdk-nodejs-all) supplies maintained request signing, verification and certificate support. Prefer a qualified provider adapter using that official SDK over adding another signature implementation when enabling real Alipay. The existing Credits payment code remains test-only; merchant credentials, callbacks/replay and refund/reconciliation qualification are still required before activation. This UI correction does not call a merchant or enable collection. No unrelated payment rewrite is required to restore the console.

## Verification

Verify the actual reused production Vue build and each original dashboard/table role against only the clean Entroqi database. Test cookie attributes, origin/session failure, role forgery and scope isolation; preserve all existing financial/agent tests. Inspect the live empty charts and verify their aggregates using synthetic isolated-test data, never copy historical customer totals into the company database. Show actual registrations and zero records when the new company store is empty. Record dependency audits, tests, screenshots and remaining activation boundaries in the handoff.

## Reviewed GitHub organization, 4 November 2026

The owner's source-publication request adds a private `ShenghangWang/entroqi-credits-back-office` source home for the maintained console history. This preserves the original UI and its policies; no frontend code is copied into public Credits. Simulation's private company manifest pins the paired commits and automates safe checkout and integration verification. Read [the policy map](current-state-and-policy-map.md) before interpreting historical Phase8 capabilities. Unmounted policy/provisioning writes are explicitly advertised and shown read-only.

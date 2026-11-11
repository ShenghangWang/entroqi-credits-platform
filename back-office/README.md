# Original Credits back office

Read the parent [AGENTS](../AGENTS.md) and [source/policy map](../docs/current-state-and-policy-map.md) before work. This README owns console build/use details, not a second status/backlog. Compare current/pending source and reuse matching dated verification before rebuilding unchanged UI for a documentation task.

The original Vue/Naive UI/ECharts console is the frontend of this Credits project. Develop it here in `back-office/`; the former `ShenghangWang/entroqi-credits-back-office` repository is a provenance archive after consolidation, not a second implementation queue. Public source was explicitly authorized by the owner on 4 November 2026. Operator credentials, databases and runtime staff access remain private.

The complete original history through `64275f2b9f576c5a7df2ca87127e1d72ef09dc75` is retained as ancestors, without squashing. The initial imported tree exactly matches that source. Original hashes and extraction provenance remain in `reuse-manifest.json`; never rerun extraction over maintained adaptations. No UI, charts, tables, forms, roles or policy helpers are replaced.

## Build and use

From the Credits repository root, use Node 24.19.0 and both existing committed lockfiles:

```sh
npm ci --ignore-scripts
npm run install:console
npm run build
```

For frontend-only iteration, run `npm run build:console` at the root or `npm run build` in this directory. Configure local `CREDITS_CONSOLE_DIRECTORY` to the absolute `back-office/dist` directory, then open `/back-office`. The container sets this path to its included build. The service owns staff HttpOnly sessions and bounded immutable static delivery. Never put credentials in source or browser storage.

The login and administration routes load on demand; original charts load when their page opens. **定价与收费方案** reuses the server calculator, monthly/quarterly/yearly/two-year plans, optional trials, combination discounts and reviewed publication/withdrawal. **所有者与操作记录** manages independent named owners and consequential-action before/after history. No new permanent/version-license sales or live payment adapter are enabled.

## Preserved policies and actual capabilities

[The policy map](../docs/current-state-and-policy-map.md) connects the historical host-app work to current standalone capabilities. Original Owner/Admin/Agent hierarchy, creation/commission helpers and forms remain preserved. Staff-assisted creation and editable policy persistence still require company-identity/audit integration; unavailable controls remain honestly read-only. Regular users self-register through company identity. Named-owner creation is implemented with reauthentication/audit; agents default off and confer no purchased app access.

## Verification

Root CI builds and audits both pieces. From the Credits root, against only an explicitly disposable test schema:

```sh
npm run verify:pricing-ui -- --console-directory back-office/dist
npm run verify:owners-ui -- --console-directory back-office/dist
```

Simulation’s private `company:verify` uses the console under its pinned Credits checkout and retains the existing company/API/browser workflows at root and `/simulation/`. Do not run database fixtures in parallel or against production. Source publication does not deploy a service or qualify actual host/mail/AI/merchant/device operations.

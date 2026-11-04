# Original Credits back office

Private operator component for the Entroqi company platform. This is the original full Vue/Naive UI/ECharts console requested by the owner, with its chart/table/dashboard structure, named owners, Admin/Agent policies and forms retained. It is not a redesigned or duplicated finance console. Original hashes and extraction provenance remain in `reuse-manifest.json`; do not rerun extraction over the maintained source.

The existing Credits core is public; this frontend remains private. Simulation's private `company.release.json` pins the compatible Credits, Atlas and original-console commits and supplies company checkout/verification commands. Each repository remains the owner of its implementation; the manifest adds no runtime imports or shared auth/database store.

## Build and use

Use Node24.19.0 and the committed npm lockfile:

```sh
npm ci --ignore-scripts
npm run build
```

Configure the paired Credits service's `CREDITS_CONSOLE_DIRECTORY` to the absolute `dist` directory, then open `/back-office`. The service owns staff HttpOnly sessions and safe static delivery. Frontend source contains no operator credentials; configure those privately on the server. The login and administration routes load on demand, keeping chart/dashboard code out of the initial login download. Original charts still load when their page opens.

**定价与收费方案** reuses the exact server calculator, monthly/quarterly/yearly/two-year plans, optional trials, combination discounts and separately reviewed publication/withdrawal. **所有者与操作记录** manages independent named owners and consequential-action before/after history. No new permanent/version-license sales or live payment adapter are enabled.

## Preserved policies and actual capabilities

Credits `docs/current-state-and-policy-map.md` maps the older host-app Phase8 plan to the current standalone source. Original Owner/Admin/Agent hierarchy, account-creation/commission helpers and future forms are preserved. Staff-assisted creation and policy persistence still need the company-identity/audit integration. The server advertises these as unavailable; controls remain read-only instead of suggesting that an unsaved browser-only toggle changed company policy. Ordinary users can self-register through the existing company account service. Owner creation is a separate implemented, reauthenticated/audited action. Optional agents default off and never confer purchased app access.

## Verification and publication

From the paired Credits checkout, against its explicitly disposable test schema:

```sh
npm run verify:pricing-ui -- --console-directory /absolute/path/to/back-office/dist
npm run verify:owners-ui
```

Simulation's `company:verify` builds all three companions and runs the existing real company/runtime/Atlas/Credits browser/API workflows at root and `/simulation/`. See the private root integration guide for exact source pins and required test configuration. Do not run database fixture jobs in parallel or against production.

Private GitHub checks retain the frozen install, production audit and type/build checks on one automatic push event, with a bounded manual check available. Local real-service browser evidence and CI build evidence are separate. Source publication never deploys a website, changes an audience, creates a payment, or qualifies actual host/mail/AI/merchant/device operations.

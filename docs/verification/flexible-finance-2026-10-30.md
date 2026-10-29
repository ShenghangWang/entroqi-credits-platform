# Original-console flexible finance verification,30October2026

This is local source verification for the current integration branch, not hosted/merchant/remote-CI qualification. The original private Vue console remains a separate private source workspace and is not included in this public repository.

## Passed checks

- Backend TypeScript, ESLint,173 unit tests,42 real MySQL integration tests and clean production build. Migration000014 applied/repeated on the isolated test/company schemas; no historical data imported.
- Original Vue typecheck/build; real Chromium original-layout login, three-product selection, Decimal cost calculation with AI USD/FX and itemized compute, draft creation/publication, monthly14-day-trial to exact-version lifetime/no-trial change, historical revision preservation, reload and logout. Independent result: CNY100 price minus30 direct cost minus4 reserves =66 contribution; ten sales minus50 monthly fixed cost =610 estimated operating profit. Test-only values. No external browser requests or page errors.
- Public-backend browser session/API mode independently passed; it explicitly does not claim to include the private Vue build. Its workflow now calls `verify:pricing-contract`; full original UI mode requires `verify:pricing-ui -- --console-directory ...`.
- Cross-repository test harness uses actual staff HTTP publication, actual MySQL and the actual Simulation/Atlas readers and backend commercial clients. All three apps consume monthly versus exact-version license and trial changes; one product's trial does not unlock another, and existing trials survive later policy changes. Identity resolution in this harness is an explicit synthetic fixture; hosted identity is not claimed.
- Atlas production builds,types,25 tests,actual compiled DOM UI pricing/refresh checks for both products and unchanged catalog integrity checks. Their immutable research hashes are preserved; no hosted commerce activation is claimed.
- Simulation production build/types and609 numerical/storage/domain/package tests passed; full root browser suite and root/subpath draft-recovery checks passed; dedicated offer/commercial/billing tests reject impersonation, foreign products, stale identity and contradictory paid flags. Full browser/package/release evidence is maintained in its owning private repository. Existing editor test fixes are reused from its prepared PR#5 rather than replacing its engine or developing competing behavior.
- Production Credits dependencies and the private console dependency tree currently report zero known advisories. This is dated registry evidence, not a zero-defect guarantee.

## Protected semantics

MySQL tests cover optimistic publication conflicts, exact money, immutable accepted terms, concurrent/replayed trials, trial expiry/no reset, membership unlink/rejoin, three independent products, exact-version lifetime rights, monthly expiry, explicit trusted payment proof, replay/mismatch/refund-before-payment and no refunded-grant resurrection. Original dashboard receipt/plan aggregates are checked against real isolated records and foreign-app scope denial.

Staff price permissions and canonical app scopes are enforced server-side; browser forms are not authorization. App credentials cannot publish or settle. No public payment/grant endpoint exists. A valid wallet, registration or price does not imply a purchase. Monthly is manual renewal and trials never automatically charge.

The live company database remains unpriced with no fabricated customers, transactions, trials, quotes or grants. Synthetic prices and payment-proof fixtures are confined to a disposable test database. No merchant, mail, AI or cloud charge was made. See [release handoff](../first-web-release-readiness.md) for activation gates; historical dated CI runs do not verify this changed source.

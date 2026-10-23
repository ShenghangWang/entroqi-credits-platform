# B03/B05 — account lifecycle and financial invariants

Owner authorization: 24 October 2026. Dependencies: private identity adapter/extraction checkpoint. This task repairs reusable core and documents the legacy application's bug; it does not enable live paid routes or change numerical simulation scope.

## Implementation

1. One customer service for scoped zero-wallet provisioning, balance and idempotent close. Add mapping tombstones. Release retained phone/email/username on completed closure; retain immutable old IDs/ledger and reject old-subject reprovisioning. New verification/subject produces an empty new wallet. Deny arbitrary browser identity or closure calls.
2. Closure blocks unresolved positive balances, holds, pending payment orders and organization/agent responsibilities; retries do not erase money or resurrect users. Distinguish suspended vs deleted/closed and retain tombstones. Product deletion needs session/reauth and fail-safe retry handling.
3. Add preflight plus personal/tenant wallet ownership uniqueness; migrations refuse dirty duplicates rather than merging. Do not drop legacy operational tables or copy old databases.
4. Guard credit mutations against negative/zero/oversized amounts as appropriate. Actual settlement permits zero, never exceeds the reserve, charges actual and releases unused hold atomically. Preserve ledger and replay behavior.
5. Parse currency minor units exactly; reject malformed/unsafe provider amounts. Review provider signature/order identity/query trust and network I/O recovery; keep unverified paths disabled and explicit residual gates.
6. Regression and real isolated MySQL tests cover same-phone/email return, fresh IDs/no old history, old-subject tombstone, multiple concurrent attempts, pending funds/hold/order denial, no negative mutations, 20-reserved/12-used, zero actual, over-reserve, duplicate terminal operations and wallet uniqueness.

## Acceptance and evidence

Run full unit/type/lint/build and isolated MySQL suites (serial when suites reset tables), fresh/repeated migrations and Docker packaging. Keep full review findings with fixed/open status. No bug-free-production claim, no merchant setup or paid traffic, no destructive cleanup of live data. Original car-sales baseline tag remains unchanged. A product-layer phone reservation must be fixed at that layer or explicitly identified as an unmigrated legacy application path; a shared SQL fix alone cannot erase a separate product database reservation.

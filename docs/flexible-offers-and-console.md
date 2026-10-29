# One finance console and configurable product offers

Owner direction:30October2026, Asia/Shanghai. This supersedes the fixed CNY79/one-time/30-day business default for future offers; existing grants and trial commitments remain valid. No final price or charging model has been chosen. Reuse the original full Credits back office and existing exact-decimal cost calculator. Remove the unused replacement panel and retire the separate calculator shell; preserve backend/domain functionality and financial history.

## Implementation contract

- One original staff interface, one HttpOnly session. Pricing is an internal page in the existing layout, not a second token-entry panel or iframe. The owner can calculate, save immutable drafts, review and publish. Managers can read; write/publication require explicit configured pricing permissions and app scopes. Agents cannot edit company pricing. Product service keys never enter the browser.
- Canonical Simulation and both Atlas products stay independent. Each price version captures amount, currency, monthly versus lifetime-for-a-specific-version terms, explicit version/edition and optional trial enabled/days. Lifetime excludes future major versions, unlimited hosting/AI/support. Trial defaults off until chosen; enabling suggests30days but requires review/publication. Trials end without automatic charging.
- Changes create immutable offer revisions and move an optimistic-locking publication pointer; they never rewrite earlier quotes, purchase snapshots, current trials or existing entitlements. Preserve existing exact money, cost evidence, expiry, margin assessment, idempotency and audit behavior. Do not invent approved prices or provider costs.
- Extend the actual private APIs and transactional MySQL implementation, not just form state. App-scoped offer readers return published customer-safe terms only. Quote snapshots and explicit one-per-identity/per-product trial starts retain their accepted terms. Price browsing never starts a trial. A model/amount change cannot reset trial eligibility. Identity, membership and paid rights remain separate.
- Real merchant collection and recurring mandates remain gated until credentials, signed provider evidence, refunds/reconciliation and operational qualification exist. No browser or ordinary product service may mint a paid grant from a wallet/price/membership. Prepare and test billing-mode/access semantics behind a trusted settlement boundary; never pretend fixture payments are real.
- Update each owning app's pricing reader/display to consume the shared offer contract, preserving original product engines, research previews, existing versioned grants and pilot commitments. Reuse company identity and keep backend secrets out of static assets. Static hosted demos do not gain a private backend merely by publishing this source.

## Review sequence and acceptance

1. Audit live entry points and obsolete files, then remove only superseded runnable UI/launch code. Keep historical source/evidence and the optional agent mechanism.
2. Implement versioned offer terms and additive transactional storage/contracts. Test mode switches, free-trial toggles/durations, prior-contract preservation, concurrent edits/idempotency, exact money, expiry, scopes and cross-product isolation.
3. Integrate calculator/offer editing into the original console with one staff login, clear draft/published states and a customer preview. Test actual server calculations and MySQL persistence through the UI.
4. Wire app-facing readers/adapters and prepare hosting integration. Verify real cross-repository HTTP/database behavior and preserve all existing app tests. Record fixture versus live boundaries precisely.
5. Deliver a consolidated release-readiness list for domain/hosting/mail/merchant/AI setup and all remaining non-purchase prerequisites. No purchases, external messages or rollout are authorized by engineering readiness alone.

## Implementation status

Implemented: original-console pricing page and same-session APIs; strict immutable terms; additive trial/quote/verified-settlement/access storage; app-scoped safe offer API; exact cost calculator reuse; independent Simulation/Atlas readers and displays; removal of obsolete executable panels and clean build output. The protected optional agent domain remains. Test-only prices never enter the live company database.

Monthly currently uses manual renewal. A trusted settlement adapter is prepared and fixture-tested, with no public settlement endpoint, no default verifier and no live merchant. The owner/operator workflow and the remaining deployment, provider, durable-delivery and human gates are in [first release readiness](first-web-release-readiness.md).

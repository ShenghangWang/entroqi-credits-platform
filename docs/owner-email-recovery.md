# Company owner email recovery

29 October 2026. The owner supplied a recovery email and requested a code-based reset. They confirmed there is no email sender configured. The supplied address is stored only in private server configuration and credential-control state, **pending verification**. No real email, OTP or offline recovery code has been issued to the owner. Existing owner credentials and app grants are unchanged.

Typing an address and then proving mailbox access is email recovery, not two-factor authentication. Email addresses are identifiers that may be public. Keep the owner recovery address out of public responses/UI hints, but do not rely on its secrecy. For the highest account this flow requires an emailed OTP **and a separately saved offline recovery code**. [NIST recovery guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#account-recovery) distinguishes codes from different recovery methods; [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) covers anti-enumeration, expiry, protected storage and session invalidation. This implementation is not a claim of NIST assurance certification or a substitute for normal owner MFA.

## Private setup

Reuse the existing company account-mail adapter's Resend transport contract: fixed HTTPS API, eight-second timeout, no redirects, idempotency key and sanitized failures. No extra mail SDK or identity/password database is introduced. The recipient Outlook mailbox does not itself provide sending infrastructure; it does not have to be on the eventual company domain. Qualify a sending account/address separately. No provider account, sender domain or purchase was created by this change.

Configure privately, outside source control:

- `CREDITS_PLATFORM_OPERATORS_FILE`: the owner-only staff credential document, in an owner-only directory.
- `CREDITS_OWNER_RECOVERY_SECRET`: independently generated32-byte URL-safe Base64 secret,43 characters. Back it up separately and do not rotate/delete it to fix a delivery error. It derives separate OTP-HMAC and encrypted-outbox keys.
- `CREDITS_OWNER_RECOVERY_EMAIL`: the staged recipient, used only by the protected setup command. Never hard-code it in reusable source or browser configuration.
- `CREDITS_RECOVERY_MAIL_PROVIDER=resend`, `CREDITS_RECOVERY_MAIL_FROM` and `CREDITS_RECOVERY_MAIL_API_KEY`: qualified sender and private API credential. Keep unset until selected/authorized and tested. The existing company authority's mail implementation is the reuse reference; do not give its API key to the browser.

After building Credits, an authorized server administrator may stage an existing owner's contact using the private environment:

```sh
npm run staff:credentials -- stage-owner-email \
  --file /srv/credits-private/staff-operators.json \
  --operator company-owner
```

This stages an address; it does not establish mailbox control or enable recovery. It refuses to replace a different existing contact without a reviewed operation. Public requests cannot select an owner, role, recipient or grant. Only the protected operator's exact staged address is eligible for mail.

The file now supports a versioned envelope containing original operator records plus recovery control state. Existing array-only credential files remain readable. Preserve the envelope during backup/restore and code rollback; old binaries that understand only the array must not be used after staging. Do not restore old credential or recovery state to reactivate a used code. If freshness is uncertain, block recovery, reconcile state and use independently authorized host recovery/re-enrollment.

Email recovery requires atomic **write** access to that dedicated private directory and its audit journal. The earlier read-only mount remains suitable for host-only rotation but cannot run web recovery. On the chosen host, supply only this narrowly scoped application-owned directory as a writable mount, with0700 directory/0600 files and correct UID. All instances must see atomic replacements through the directory mount. Do not expose the directory under any web root or publish the service's internal/private APIs.

## Enrollment before a lockout

1. Configure and qualify actual sender delivery to the authorized owner's mailbox, exact HTTPS staff origins and ingress controls. Provider acceptance alone does not prove arrival. The UI truthfully disables sending when no transport is configured.
2. Sign in as the existing company owner. Open **凭证与账号恢复** and choose first-time setup. Enter the full staged recovery email and reauthenticate with the current owner credential. Admin/Agent/customer sessions cannot enroll a recovery contact or become owner.
3. Enter the8-digit email code, valid for10 minutes and at most5 attempts. Only a provider-accepted message is eligible for verification. Failed delivery remains queued; no address is marked verified from an API request or from merely typing it.
4. The server issues a random256-bit offline recovery code once. Save it independently from the mailbox and confirm that it was saved. Until that explicit acknowledgment, email recovery remains inactive. Only its hash persists; the plaintext code is not recoverable later. Reloading before acknowledgment requires another verified enrollment attempt.
5. Activation queues a notification to the verified mailbox. Independently monitor recovery audit/outbox health. Losing the saved code does not enable email-only reset: use the existing protected server recovery procedure and re-enroll.

## Recovering the owner account

At the login recovery panel, enter the full recovery email; the UI never displays the registered address or a masked hint. Matching and nonmatching addresses receive the same public response and random challenge identifier. Codes are generated cryptographically and delivered only to the staged, verified address. Knowledge of the address alone does not authorize anything.

Provide the emailed code plus the saved offline recovery code. Successful proof issues a random, hashed, single-use reset ticket valid for5 minutes; it does not log in the user. Confirm reset to generate a new high-entropy owner login credential and a replacement offline recovery code, displayed once in the page. Save both separately and sign in normally. The platform's owner currently uses a generated credential; this does not add another human-password database.

Credential rotation, old offline-code invalidation, reset-ticket consumption, new-code hash and notification-outbox creation occur in one atomic credential-document replacement. Old login/bearer credentials and sessions fail on the next request on every instance reading the current file. Other operators, roles, product access, pricing/service secrets and financial records are unchanged. An already-authorized in-flight request is not undone.

The protected server-admin fallback remains. Using it invalidates email challenges/tickets and saved backup codes and returns email recovery to pending enrollment. It is not callable through the public recovery API.

## Bounds, persistence and activation limits

OTP verifiers use a server-keyed HMAC; reset tickets and256-bit offline codes are hashed. Pending mail payloads are encrypted with AES-256-GCM using a separately derived key. No code, recipient or generated credential enters request logs, URLs, browser storage or public source. Page-held secrets are cleared on route changes/unmount. The original console/login layout is reused.

The private document is bounded to64KiB, with capped challenges,15-minute attempt history and encrypted outbox entries. Actual socket-peer HTTP throttling supplements persistent per-address/peer/challenge controls. Sending is conservatively capped at10 verification-code attempts per UTC day; resends invalidate older codes and still consume budget. Recovery notifications have reserved queue room and are not suppressed by the verification-code quota. Abuse does not lock the normal owner login. Deployment-wide ingress protections and capacity qualification remain required.

The durable encrypted outbox uses a30-second lease and bounded retries with provider idempotency, preserving work across restarts. OTP mail expires after10 minutes; notifications remain eligible for24 hours. If the notification queue is full or required state/audit cannot be written, reset does not proceed. Completion state retains the recovery event ID even if appending the secondary audit-completion line fails. Independently monitor pending, expired and exhausted notification attempts: a queued event is not proof of delivered owner notification. Stale filesystem locks deliberately fail closed; follow the incident/receipt reconciliation process before authorized removal.

Current local status: recipient staged privately, mailbox unverified, no sender, no live email recovery activation. Fixture transports verify the code/reset/notification behavior without contacting a provider. Real enrollment, mailbox arrival/spam handling, external alert retention, normal staff MFA, selected-host multi-instance/restore qualification and DNS/sender setup remain launch work.

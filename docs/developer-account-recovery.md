# Company owner account recovery

29 October 2026. The owner confirmed a company domain has not been purchased; local emergency recovery does not require one. The company owner currently uses the existing highest Credits role, internally named `developer`. Current Credits staff login uses a random server-managed operator credential, not a human password stored in an account database. Product customers already have a company account authority based on Better Auth, with verification, expiring single-use reset links and session revocation. Keep that authority; do not create another password database in Credits.

## Industry model and decision

For normal online staff access, use the company identity provider with MFA/passkeys and its recovery controls. Bind immutable verified subjects to explicitly granted staff roles; knowing an email or resetting a company password never creates developer authority. Your existing company reset implementation is the reuse point. Staff SSO/MFA itself is not activated by this change.

Highest-privilege access also needs an independent emergency procedure when normal authentication is unavailable. [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) recommends protected, separately backed-up emergency credentials and recovery drills. [Microsoft emergency-access guidance](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access) describes independent emergency access, separate methods and monitoring. For this currently private, server-configured Credits console, retain the protected server/secret-manager administrator rotation as a fallback. The owner-requested email flow now adds verified-mailbox proof plus a separately held offline recovery code; [email recovery setup](owner-email-recovery.md) describes its enrollment and activation gates.

[OWASP account recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) calls for anti-enumeration, throttling, protected reset proof, session invalidation and notification. [NIST account recovery](https://pages.nist.gov/800-63-4/sp800-63b.html#account-recovery) distinguishes saved/issued codes, contacts and repeated identity proofing, with stronger requirements at higher assurance levels. This server-admin mechanism is not a claim of NIST AAL2/3 certification or a replacement for MFA. No security questions, shared master password or secret “back door” is added.

The owner has now supplied a recovery address and confirmed no email sender is configured. The address is staged only in the private credential-control document. It is unverified and inactive; no real email has been sent. Email address knowledge is not a second authentication factor.

## Configure before a lockout

Build Credits. On the protected server, create an application-owned private directory (mode0700); its credential file is mode0600. The runtime accepts the legacy array and the versioned envelope containing owner-recovery control state. Preserve that current envelope; do not downgrade to a binary that only understands the older array. Keep it outside source control, web roots and ordinary application-data backups. Authorize at least two trusted human custodians for independent server/hosting recovery, using named identities and MFA; do not create a shared daily developer login. Store emergency hosting keys/recovery codes in a separate controlled vault/offline location, not only on the same laptop/server as Credits. Changing custodians or creating additional staff grants needs the owner's explicit authorization.

Initialize once from the existing privately supplied `CREDITS_PLATFORM_OPERATORS` environment array:

```sh
npm run build
npm run staff:credentials -- init --file /srv/credits-private/staff-operators.json
```

Use your actual application-owned path; the example directory must be provisioned first. Do not paste real tokens into shell arguments or command history. Set `CREDITS_PLATFORM_OPERATORS_FILE` to that absolute path and remove the old environment credential array (`[]`). Restart once to select file mode. The init command refuses an existing file. Existing IDs, roles, scopes and credentials are preserved.

The file is the single authoritative secret source. No old environment credential is used if the file is deleted, malformed, over64KiB, a symbolic/hard link, owned by another user or readable by group/others. Product/payment/pricing secrets cannot be reused as staff credentials. The login UI never receives the file, path, entire operator list or stored secrets.

All replicas must read the same current version before claiming a complete rotation. On a single host, mount the private **directory**, read-only to each application container; mounting only a file inode can keep the old file after atomic replacement. Run maintenance as its authorized owning OS identity; never make the file world-readable to work around a UID mismatch. A managed secrets platform may distribute this file, but its adapter/propagation must be qualified on the selected hosting system. If replicas cannot see the update, block staff ingress, update/restart every instance, verify old access fails, then reopen. Production TLS, exact trusted origins, ingress login limits and private service networking remain required. HTTPS-origin login emits a Secure cookie even behind TLS termination; do not expose an HTTP staff origin publicly.

## If the developer credential is forgotten

1. Verify the requesting owner's identity through a previously established independent channel. Record an incident/change reference. Email alone, a product customer session or an Agent/Admin request is not enough to authorize highest-role recovery.
2. A trusted custodian signs into the hosting/server/secret manager using its independent MFA-protected access. If that access is also lost, use the hosting provider's pre-enrolled recovery methods and documented proof-of-ownership process; the public Credits web service offers no bypass.
3. Rotate the existing developer ID using the protected terminal:

```sh
npm run staff:credentials -- recover \
  --file /srv/credits-private/staff-operators.json \
  --operator company-owner \
  --output /srv/credits-recovery-private/recovered-credential-INC123.json \
  --reason "INC-123 owner independently verified"
```

The output directory must already be private and application-owned. The command generates256 random bits, never prints the credential, preserves ID/role/subject/app grants, and refuses to create/elevate an account, overwrite a receipt or run concurrently with another maintenance command. It records requested/completed events in the sibling `.audit.jsonl`, including time, incident reason, event ID and the OS actor. Do not include credentials or personal identity documents in the reason. Named server logins and host audit provide custodian attribution when a service OS account is used.

4. Existing sessions and old bearer/login credentials for that operator fail on their next request on every instance reading the authoritative file. In-flight requests authorized before rotation are not undone. Other staff sessions remain valid. Import the new private receipt into the owner's password manager through an approved secure channel; after verification and secure import, remove staging copies under the hosting/storage provider's retention process. No secret is emailed or put in a chat. Sign in normally; recovery does not automatically create a web session.
5. Confirm that new login works and old login, an already-open old session, and old bearer access fail. Review/notify the owner and security custodian through the pre-established monitored channel. Review other keys or sessions if compromise was suspected. Record the incident outcome and repeat a nonproduction drill after meaningful hosting/auth changes and on a scheduled operating review.

## Interrupted recovery and backup restoration

A private receipt is written and synchronized before the credential source is atomically replaced. The audit records intent before mutation and completion afterward. If the process/disk fails between these steps, a staged receipt or a requested event does not prove rotation succeeded. Determine the actual outcome without displaying the secret:

```sh
npm run staff:credentials -- check \
  --file /srv/credits-private/staff-operators.json \
  --receipt /srv/credits-recovery-private/recovered-credential-INC123.json
```

An uncompleted audit event requires investigation even if the receipt is current; preserve evidence and append the reviewed incident outcome in the monitored incident system. A stale `.lock` deliberately blocks concurrent writes. Verify its process is no longer running and reconcile the source/receipt/audit before an authorized administrator removes that lock. Do not automatically delete locks or restore old secret files to make login work.

Back up credential-control configuration and audit records separately from customer/financial data. Restore testing must not reactivate superseded credentials: block staff ingress, reconcile latest incident/key versions, issue a fresh developer credential when freshness is uncertain, replace all replicas and restart their sessions before reopening. An old MySQL/customer backup must not roll back staff secrets or role revocations.

## Notification and online readiness

The audit journal is durable local evidence, not a delivered owner notification or an immutable audit service. It is not served by the web application. Before live staff access, export events to an independently controlled monitored log/alert sink and notify the verified owner/custodians on every recovery request/completion, including incomplete requests. Qualify outage/retry/alert delivery on the selected host. The secret-file owner can edit local files, so external host audit and separate retention are required for tamper resistance. No external mail or alert destination was configured or contacted in this implementation.

The login provides account-independent owner recovery help and dedicated email-code/backup-code proof routes. Their email recovery flow is inactive until a sender is qualified, the owner reauthenticates and verifies the staged mailbox, and a new offline code is saved and confirmed. It issues a new random owner credential rather than creating a second human-password database. Optional `CREDITS_COMPANY_ACCOUNT_RECOVERY_URL` links only to a configured HTTPS company account UI (loopback HTTP allowed locally); ordinary customer password reset remains in existing Better Auth. No fake “reset email sent” message appears when that service/URL is unconfigured.

Delivered and locally tested: private credential initialization, audited emergency rotation, receipt verification, failure/permission/concurrency handling, immediate session and bearer revocation, login throttling and original-interface recovery help. Still to qualify for online launch: selected staff SSO/MFA and subject grants, verified public company recovery URL/mail delivery, independent custodians/backup storage, monitoring delivery, replica secret propagation and recovery drills on the actual host. This is a working emergency recovery foundation, not a claim that public identity operations have already launched.

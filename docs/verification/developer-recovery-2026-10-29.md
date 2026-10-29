# Developer recovery verification — 29 October 2026

Owner requested an industry-aligned plan and implementation for losing the highest Credits credential. Owner subsequently confirmed no company domain has been purchased. [Recovery decision and operational runbook](../developer-account-recovery.md).

Implemented an authoritative private staff credential file, fail-closed dynamic reads for login/session/bearer access, a protected server-administrator initialization/recovery/check CLI and original-login recovery help. Recovery preserves the existing developer ID/role/subject/app grants and records requested/completed incidents without logging credentials. Login uses bounded actual-peer-IP throttling. HTTPS-origin login sets Secure cookies behind TLS termination. Recovery cannot be invoked by an unauthenticated web request or an Admin/Agent/customer role. Existing Better Auth company recovery remains the reuse point for ordinary company passwords, with no duplicated Credits password store.

## Executed checks

- Credits types, lint,158 unit tests and production build pass. New tests cover rotation and scope preservation, old session and bearer invalidation on two live application instances, unrelated-session continuity, corrupted-source refusal without environment fallback, private permissions/symlink/size checks, existing/invalid receipt and role refusal, concurrent maintenance lock, unsafe audit refusal, generic public help, no remote reset route, spoofed-forwarding resistance, Secure cookies and unsafe reset-link rejection.
- All36 real MySQL integration tests pass. No financial migration or mutation was added for credential recovery.
- Disposable actual CLI rehearsal passes initialize, recover, verify and missing-owner refusal. Child-process output was checked against both initial and rotated credentials: no secret printed. Rehearsal files were removed.
- The local company service was switched to owner-only file mode without changing the current developer credential. Its old environment array is now empty. Health returns200; live recovery options report managed-file recovery enabled and no company recovery URL. Existing credential equality was checked without displaying either secret.
- Browser login with the unchanged existing credential succeeds, the original dashboard still shows three applications, and the sidebar opens the new recovery-help route. Login help expands on the original interface; entered credential is cleared. Screenshot retained privately in the local demo folder. The in-app recovery route was opened through the Codex browser panel.
- Current company credential is not rotated as a side effect of this setup. Recovery was exercised only in disposable fixtures. No owner identity proof, MFA enrollment, external email/alert, domain/DNS action, merchant action or public rollout was performed.

## Remaining online setup

The owner has no domain yet. Keep the company account recovery URL unset; no pretend reset-email flow is displayed. Domain selection is not required for offline server-admin recovery. Staff SSO/MFA, verified recovery contacts/mail delivery, separately held hosting recovery methods, independently monitored audit notification/retention and actual-host multi-instance secret propagation/drills remain deployment work. The local audit is not an immutable remote audit trail or delivered owner notification; no NIST AAL certification or complete public identity rollout is claimed.

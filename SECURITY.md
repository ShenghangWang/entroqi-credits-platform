# Security policy

The owner authorized this reusable Credits repository to become public on28 October 2026. The simulation repository remains private; never copy its source, real customer projects, production databases or credentials into this repository, CI logs or artifacts. Source visibility does not expose the operational Credits API or authorize publishing a package. Report suspected issues privately to the repository owner; do not post credentials, customer data or exploit details in public issues. The public support/security contact must be configured and tested before launch.

Production starts only through `src/server.ts` / `buildPrivateApp`. The historical `buildApp` and hand-written payment adapters are test-only, use caller-supplied identity fixtures, and must never be exposed as customer APIs. No paid route is currently enabled.

Before release, run the locked unit, real-MySQL, browser and container checks, complete dependency audits, CodeQL JavaScript/TypeScript security-extended analysis, and `bash scripts/check-secrets.sh` from a non-shallow checkout. The pinned MIT Gitleaks CLI runs locally with redacted output and scans the current committed snapshot and Git history. Never upload private source or secret reports to an unapproved public service. Review actual open CodeQL alerts; a successful workflow alone does not mean zero findings. A clean scan does not certify the application.

Critical/high findings in an enabled path block its activation. Other accepted findings need a named owner, scoped impact, compensating control and dated follow-up. Preserve audit history; investigate and rotate a leaked credential rather than merely deleting it from the current tree.

GitHub secret scanning, push protection, vulnerability alerts and Dependabot security-update PRs are enabled. Full CI and CodeQL run on main and pull requests. Review/test updates before merging; automatic merging is not enabled. These controls do not grant access to private Simulation code or enable a paid service.

Deploy with private Credits/DB exposure, least-privilege credentials, protected operator access, explicit secret rotation, current runtime/base images, alerting and tested backups/restore. Do not capture passwords, cookies, bearer keys, reset URLs or sensitive provider bodies in logs. Commercial payment/provider/ledger/fulfillment and actual-host evidence remain separate launch gates.

See the [28 October source review](docs/verification/public-release-security-2026-10-28.md) and existing B03–B05 specifications for repaired and open risks.

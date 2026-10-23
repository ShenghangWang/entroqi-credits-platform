# B02/B03: private service and identity adapter

Authorized 23 October 2026. Separate commercial track; no change to the 62-task simulation denominator.

Goal: preserve the unmodified baseline, expose only authenticated identity provisioning/balance, and support self-service or staff-managed product onboarding without divergent branches.

Deliverables: standalone private server, explicit per-credential issuer/application/permissions, zero-balance atomic mapping, additive MySQL migration, simulation verified-session adapter and single-host deployment instructions.

Acceptance: missing/invalid credentials rejected before DB access; policy is server configuration; forged role/application/user/balance fields rejected; read-only credentials cannot provision; issuer-scoped subjects; concurrent repeat provisioning yields one user/wallet; no email/password import; billing failure does not affect local work. No legacy admin/payment/billing routes exposed by standalone entrypoint.

Verification: unit and HTTP checks locally; real MySQL concurrency and Docker/deployed smoke evidence required separately. Live payments, usage charges, merchant callbacks, storage and cloud execution remain disabled.

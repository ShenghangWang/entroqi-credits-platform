# Standalone extraction and private identity verification

Date: 23 October 2026. Runtime source: `29f08bf49ab6b24812881e985989dc2ea93d1c1c`.

[CI run 39970654660](https://github.com/ShenghangWang/entroqi-credits-platform/actions/runs/39970654660) completed successfully: typecheck, lint, 63 unit tests, production build, fresh MySQL 8.4 migrations, one real-database integration test, Compose configuration validation and Docker image build. The integration test issues 12 simultaneous provisioning requests and verifies one zero-balance personal wallet, retry stability and separation from a second issuer configured for managed onboarding. Private API tests reject anonymous access, forged identity/policy/balance fields, read-only provisioning and legacy privileged routes.

Original source is preserved under `legacy-car-sales-baseline`, commit `306fbf3d41b863e3baa07bd54c99c2abba2d78db`, with tree `726a23f9a05ec2c63f40a4a482a28916d310b7ec`, identical to the car-sales external module. No original repository files or operational data changed. Main is the sole active shared-core branch; authentication and staff authorization stay in each product.

Initial CI found inherited provider stringification lint errors and a stale pool mock; these were fixed before the passing runtime checkpoint. Original provider integrations are retained but not mounted or declared verified for production use. Dependency audit findings in the inherited lockfile remain outside this extraction's acceptance and require review before paid deployment; this run does not establish live-payment readiness.

Deployment is prepared, not performed. No cloud host access or production credentials were supplied. Local dependency installation was blocked by registry DNS and local Docker by socket permissions; CI supplied isolated database/container evidence. A container image build is not an actual deployment rehearsal. Production host startup, firewall/loopback verification, TLS/mail account rehearsal, database backup/restore and outage smoke tests remain required. Payments, consuming credits, atlas products, paid storage and cloud execution are not enabled.

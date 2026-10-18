<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-002-source-combined -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-002 actual source publisher combined acceptance

## Objective

Test the actual original publisher with the actual Node durable source/private Unix IPC and the actual local notification service AuthStore/DeviceStore/SQLite router. Only new tests and cfg(test) constructors/adapters; no production scope/schema changes, new dependencies, real identities, providers or deployment.

## Acceptance criteria

- [x] Actual notification_source::publish performs the challenge/native PoP/hint/ACK, not a test reconstruction.
- [x] Actual Node durable outbox/private IPC and original Rust mutex/UID guard.
- [x] Pinned loopback HTTPS transport forwards to actual source router/signature/device/database owners.
- [x] Pre-ACK unknown/restart retries original ID/epoch/pointer into the same actual service eventId.
- [x] Post-durable-ACK response loss restarts empty without republishing.
- [x] Actual AuthStore revocation preserves pending source pointer and creates no event/ACK; wrong captured generation rejected.
- [x] New Node eslint, root tsc, normal headless185 and explicit actual combined test.
- [ ] Parent independent replay/integration/main delivery.
- [x] Actual publish future cancellation before/after real hint processing retains original source identity and dedupes fresh-proof retry.
- [ ] Connector/WSS cancellation trigger/actual key rotation/distinct Linux UIDs/real Host/provider/push/physical/production gates (not implied by this local fixture).

## Completed

New service test-build fixture, Node source fixture and native combined test plus narrow cfg(test) native identity/verifier/same-UID Unix fixture constructors. Exact birth PGID child cleanup and TLS accept cancellation guard. No production routes/validators changed, no Cargo/lockfile changes.

Normal dependency merges:0bdaa473 (root original source),8fe96a70 (actual source PoP HTTP),df5ab268 (source receipt readback). Dependency merges are not owned work. Root newer core lint repair/interface is not overwritten; this branch does not edit core.

## Verification

`dev-docs/mobile-002/host-notify-source/combined/acceptance.md` contains the single command, exact path/limits and cleanup. Adjacent publish/regression/lint logs are committed, with no temporary credential values. Explicit actual combined test passed; normal headless185 passed/1 ignored; new Node fixture eslint and root tsc exit0. Whole strict headless clippy has two pre-existing too_many_arguments findings; allowing only that baseline lint passes the new code.

## Blockers and unknowns

Parent review/replay remains open. This is a synthetic original pointer and test identity constructor, not a complete Host supervisor/identity bootstrap or physical acceptance. Actual publish-future cancellation at two HTTP boundaries and actual AuthStore revoke are verified separately; the original connector/WSS cancellation trigger remains unverified. Model/backend identity, currency usage and total wall-clock usage are not observable; local command durations are in logs. No further delegation.

## Next step

Parent normal-integrate the owned test commits, rerun the single explicit command against current root (including backend core API repair), and retain real Host/provider/physical gates. No deployment is requested from this worker.

## Independent cancellation test extension

Only the service test middleware and native combined test change. The middleware pauses before or after the actual source handler, and the actual publish future is dropped at that point. Both unknown-side-effect states retain the original outbox pointer and fresh-proof retry confirms one real event. See `dev-docs/mobile-002/host-notify-source/combined/publish-future-cancellation.md` and exact log. No production hook/auth bypass or Session command is added.

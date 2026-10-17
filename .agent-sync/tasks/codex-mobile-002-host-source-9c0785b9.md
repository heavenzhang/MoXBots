<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-002-host-source -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-002 Host notification source

## Objective and scope

Adapt the original Linux Node Host/Session supervisor through its existing protected IPC and original Rust owned connection into generic mobile notification hints. No new executor, public management RPC, global credentials, cloud deployment, real account mutation or Provider call. Owned write scope: Node Host, private IPC, Rust headless connector and narrow shared OwnedClient source HTTP routes; no services/agentnet, mobile app, frozen crypto/protocol/vendor/Reader/release changes.

## To do and state

- [x] Observe actual origin worker generation and original SessionStore/registered Agent workspace; exclude Bot/delegated/private sessions.
- [x] Scope-bound private durable generic-pointer outbox with atomic readback, bounded TTL/capacity, immutable source ID/epoch, restart/ACK-loss semantics, independent confirmed tombstones and durable deferred promotion. Active birth freezes authenticated source scope; later scope switch cannot rebind old worker observations.
- [x] Closed local-source reverse IPC independent of controller phone peer, reusing original transport lock/UID guard.
- [x] Rust-owned fresh account/native key PoP through fixed pinned HTTP routes, exact201 challenge/200 hint, no HTTP retry, bounded backoff and connection future cancellation.
- [x] Local source/IPC/Host/mobile/assets/receipts regression and typecheck; see acceptance/logs.
- [ ] Root combined origin→native IPC→actual source service integration and independent review.
- [ ] Integration owner normal main/CI/remote delivery.
- [ ] Real Linux Host, real account/device generation/revocation, push/physical device/provider production acceptance (outside this worker's allowed actions).

## Dependencies

Base remote main9269dd8; normal dependency merge238a40cb. Backend source contract is coordinated with worker mobile_sdk_audit. Source epoch remains original durable dedupe metadata across same-scope reconnect; it is never authority and does not require the old connection to remain live. Source proof is fresh DeviceStore-backed original native device proof.

## Evidence and limitations

`dev-docs/mobile-002/host-notify-source/acceptance.md`, `rust-tests.txt`, `node-tests.txt`. Code/local deterministic acceptance and real-account/physical/production gates are separate. Before first authenticated source IPC establishes scope, terminal observations are ignored; old unknown scope is never rebound to another account. Current-source membership changes and pending outbox delivery are rechecked without Session mutation. Root still needs end-to-end acceptance; no main merge/release claim from this branch.

## Deployment request

Not performed; source-only handoff to parent integration owner. New source service/mobile/Host deployment requires that task's established target/owner gates. Shared OwnedClient edit must enter root native SDK provenance rebuild.

## Next action

Root review exact owned commit, integrate normal merge, combine backend source service and Host synthetic end-to-end tests; retain physical/provider gates.

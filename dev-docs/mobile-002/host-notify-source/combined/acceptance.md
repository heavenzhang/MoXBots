# Actual source publisher combined acceptance (local only)

Status: source-only in-progress checkpoint; parent integration/main and physical/production gates remain open.

## Single reproducible command

From the repository root, with root Node dependencies already installed (tsx is required):

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path src-tauri/headless-network/Cargo.toml --locked --offline actual_publish_private_node_source -- --ignored --nocapture
```

The test itself builds/launches the separately locked service test binary with:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/Cargo.toml --locked --offline actual_host_source_service_fixture -- --ignored --nocapture
```

No Cargo dependencies or lockfiles were added/changed. The two crates remain separate processes with their original dependency resolutions. Both explicit fixture tests are ignored during normal suites so normal tests never start this fixture accidentally.

## Actual exercised path

1. The Node child runs production `HostNotificationSource` and `connectHostManagementIpc`, private real Unix socket framing, path/owner checks and the original Rust connection mutex/peer UID guard. A fixed synthetic original pointer is validated by the fixture; no Session executor is installed. This test does not launch the complete Host supervisor/SessionEngine.
2. The native test invokes the **actual `notification_source::publish` function**, including its original `peek`, fresh `Connection::account`, fixed source HTTPS calls, `DevicePrivateKey.sign_proof`, pointer reread and ACK. It never manually reimplements the signature/challenge/hint flow.
3. The native account is a temporary encrypted existing Owner and the management grant uses original `management_admission::authorize`. A cfg(test) identity constructor supplies the generated original key, real account and local key scope; synthetic access/WSS fields are unused. This does not exercise WSS/identity bootstrap or enrollment.
4. The pinned OwnedClient connects to a generated loopback TLS certificate. A test-only TLS byte bridge forwards HTTP to the actual `MobileNotificationService.router` with real `AuthStore`, `DeviceStore` and SQLite notification store. The actual router issues/consumes its challenge and verifies the signature against the CSR registered in the actual DeviceStore. The TLS bridge is transport, not a replacement notification service or signature validator.
5. Only test-build fixture adapters expose the descriptor and a real AuthStore-backed `/auth/session`. No fixture routes are compiled into production. Source production routes/schemas/validators are unchanged.

## Passed assertions

- Before local durable ACK: first actual publish reaches a real persisted notification event, then local ACK is deliberately rejected. Node restarts using the actual persisted outbox; exact sourceEventId, connectionEpoch, agentId and sessionId remain unchanged. A second actual publish obtains a fresh source challenge/PoP, and the real SQLite row count remains1 with the same opaque service eventId. The actual Node ACK record matches that database eventId; two separately finalized challenge rows retain the same original epoch/pointer/eventId.
- After local durable ACK: another original observation creates a second event; Node persists ACK but closes its private IPC before replying. Native publish reports unconfirmed. After restart, the actual outbox is empty and another actual publish returns no work; service row count remains2.
- Actual `AuthStore.revoke_session`: a third original observation remains pending. Native fresh-account HTTP is denied after revocation, no local ACK occurs and the actual notification row count remains2.
- A captured local key generation mismatch is rejected by native scope validation before publication. This is a native guard test, not an actual DeviceStore rotation test.
- A persisted counter across Node restarts confirms no public Session dispatch was requested. No executor/provider/model is installed or called by the fixture.

Actual final stdout is adjacent in `publish.txt`. Normal headless regression:185 passed/1 explicit combined ignored. New Node fixture eslint and root tsc exit0.

## Cleanup, failures and limits

Each run creates one0700 temporary directory under the current private home (Unix socket path limits),0600 coordination files, a fresh native key, encrypted local Owner and isolated service databases. Temporary bearer values exist only in the private ready file and Rust owner; they never enter Node, test output or Git. TLS bridge output reports only byte counts; original HTTP diagnostics redact dynamic routes. No temporary credentials are committed.

Every fixture child starts in its own exact birth PGID; cleanup sends stop files, terminates that PGID and waits, including cargo/esbuild descendants. The TLS accept thread has a Drop cancellation guard. Success deletes the fixture directory. Failure retains only that printed private fixture directory for diagnosis; processes/loopback listener are still stopped. It may contain temporary test-only credentials and must not be uploaded or committed; remove only that exact directory after inspection.

Fixture development failures were local coordination defects: accepted sockets inherited nonblocking mode on macOS; a non-atomic JSON command was read during truncation; restarting Node before the original Rust transport observed EOF blocked readiness. The fixture now sets blocking accepted sockets, atomically renames coordination files and explicitly lets the original transport observe old EOF before reconnect. Production logic was not changed to bypass these conditions.

Strict whole-headless `cargo clippy --all-targets -- -D warnings` remains blocked by two existing too_many_arguments findings in shared `owned_login::raw_request_with_limits` and `connector::handle_management_events`. The same command with only that existing lint explicitly allowed passes, including all new test code; it is not reported as a clean strict gate. Exact outputs are adjacent.

Unverified: dropping a live publisher future during an in-flight operation, actual DeviceStore key rotation, distinct Linux service UIDs, deployed TLS termination/Host, original real Agent/Session ownership birth, provider execution, push delivery, phone/physical devices and production deployment. Revocation is not used as evidence for lifecycle cancellation. All traffic is local loopback; no account/provider/deployment/public exposure was changed.

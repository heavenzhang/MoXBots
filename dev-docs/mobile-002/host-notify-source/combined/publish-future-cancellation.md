# Actual publish-future cancellation supplement

This is an independent test-only extension after checkpoint aa448e41. No production cancellation hooks, authentication changes or protocol/schema changes are introduced.

Reproduce with the same single command:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path src-tauri/headless-network/Cargo.toml --locked --offline actual_publish_private_node_source -- --ignored --nocapture
```

The actual service test router is wrapped in test-build-only middleware. For one source hint request it pauses either immediately before `Next::run` or after the actual source handler has completed. Flags are captured at request entry, so an older canceled request cannot adopt a later test case's pause. No signature, bearer, DeviceStore or notification-store validation is replaced.

The test pins the actual `notification_source::publish` future, awaits the service's pause marker concurrently, and then exits its lexical scope, dropping that actual future and its pending HTTP operation. It checks the real Node/private-IPC outbox before releasing the server. Both cases preserve the same original sourceEventId, connectionEpoch, agentId and sessionId with no ACK.

- **Before processing:** real SQLite event count has not increased at the cancellation boundary. After release, the old handler may still run or may have been canceled; a fresh proof retry must settle exactly one event for the unchanged source ID.
- **After processing:** real SQLite already contains the event before cancellation. After release, a fresh challenge/PoP retry must confirm that same single event. It cannot create a second event or a different source ID.
- In both cases, the actual Node durable confirmed eventId matches the real SQL row; every persisted challenge retains the original epoch and pointer. The persisted Node Session-dispatch counter remains0 across all restarts/cases.

The full combined test, including earlier pre-ACK/post-durable-ACK scenarios and actual bearer revocation, passed (1 test,17.46s); exact output is in `publish-cancellation.txt`. Normal native185 tests still pass with this explicit fixture ignored. New Node fixture eslint/root tsc pass; clippy retains the separately documented pre-existing too_many_arguments baseline.

This verifies dropping **one actual publish future** at these two HTTP boundaries. It does not verify that an original connector/WSS close, shutdown or policy event triggers that drop in an installed Linux Host, nor does it prove a real DeviceStore rotation, provider action, push delivery, phone or production behavior. Those gates remain separate. Cleanup is the same exact-PGID/TLS-guard cleanup described in the checkpoint acceptance document; successful runs remove all temporary identities/state.

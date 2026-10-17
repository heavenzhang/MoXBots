# Owned relay recovery independent review

Task: `MOXBOTS-BACKEND-RECOVERY-20261017`.

The review covered the current `relay-core` return authority, `RelayController`, callable metadata authority, and the new client recovery probes. It did not change production or existing implementation files. The independently owned regression file is `services/agentnet/relay-core/src/return_recovery_review_tests.rs`.

## Findings and repair verification

- **P1 — Outage-window extension:** `route.resume` originally cleared the outage deadline before a return channel was rebound. Repeated resume/disconnect could extend the window; leaving the channel unbound could retain the route indefinitely. The revised server preserves the original deadline until a Ready exact-pair rebind. Client recovery expiry is separate from the suspended/send-blocking state. The target proactively rebinds live contexts without waiting for a terminal callback, and both endpoints receive a validated `route.rebound`, so a short outage does not limit an otherwise online long-running task to 15 minutes.
- **P1 — Duplicate permit after source identity/socket replacement:** the original duplicate-permit branch checked the target and attempt but did not revalidate the original source endpoint. The revised branch checks current full endpoint identity and immutable original admission epochs. Return-route epoch migration cannot migrate original execution authority, including after resume and successful rebind.
- **P2 — Lost close reason:** `route.close` originally replaced the owner's reason with `RETURN_CLOSED`, defeating the source's deliberate handling of admission failure/completion/cancellation. The revised implementation preserves the validated reason.

The AuthStore transaction remains the outer gate for HTTP metadata mutations and relay controls. Callable authorization holds the MetadataStore transaction through the synchronous runtime transition. Inspection found no new inverse lock order or HTTP mutation race in that path. Endpoint matching includes the complete device scope, login session, key fingerprint, certificate fingerprint, and identity binding; authorization is rechecked before resume/rebind.

## Independent regression result

Executed:

```sh
cargo test --manifest-path services/agentnet/relay-core/Cargo.toml review_ -- --nocapture
```

Result: **5 passed, 0 failed, 15 filtered out**; test execution 2.80 seconds. Total command duration was 53.33 seconds including waiting for package-cache locks.

Coverage:

1. Same-attempt permit reuse rejects changed source session, key fingerprint, certificate fingerprint, identity binding, and key generation.
2. Same-attempt permit reuse rejects source socket replacement.
3. Resume without rebind preserves the first outage deadline, including a second disconnect, and expires at that original deadline.
4. A successful exact Ready-channel rebind notifies both endpoints, clears the outage deadline, and allows a fresh window only for the next outage. The original execution permit still cannot be reacquired after recovery.
5. Both endpoints receive the original close reason for `PERMIT_EXPIRED`, `RETURN_CAPACITY`, `WATCH_CANCELLED`, `READ_COMPLETED`, and `RETURN_COMPLETED`.

## Remaining evidence boundaries

- `route.opened` is queued before the target permit, but there is no source receipt ACK. Source disconnection before learning that association remains an admission/return uncertainty boundary. Effect ordering alone does not prove association delivery.
- The service's duplicate permit response reports remaining freshness. The lead revised the native check from exactly 5000 ms to positive remaining freshness up to that fixed budget, retaining the original request clock. The independent tests establish service-side identity/idempotency constraints; execution evidence for the new native freshness regression belongs to the lead. Original start/send requests must not be automatically replayed.
- The new recovery probe error and channel-close handling was inspected statically. The lead agent owns broader client tests and real-socket TLS integration.
- This review does not establish installed-client release, production deployment, or authenticated two-App user-path acceptance.

## Client multiplexing follow-up

The additional read-only review covered `actor.rs`, `channel.rs`, `pairs.rs`, `management_controller.rs`, and `owned_profile.rs`.

The inspected implementation fixes the application profile after a verified ChannelHello and the first strict-schema application frame; it does not permit subsequent Agent/management profile switching. Agent invocations still require the original IncomingCalls/permit authority. Management still binds the owned account, principal, network and authenticated device address and enters the original management target. Deferred frames retain FIFO ordering and MemoryBudget leases through actor dispatch, with a 256-frame and socket-queue-byte cap. Cancellation retires only the exact management channel, and unrelated controls are returned to the actor using their channel ID or request control ID.

Additional findings were reported to the lead and client owner:

- **P1 — Management cleanup interrupts Agent channels:** pre-Open refusal originally emitted Close for a never-created random channel. Pending Agent opens also bypassed the installed-peer check. The lead added a nonfatal correlated `PairExists` service response and idempotent absent Close after the live sender/control-scope gate. The client now sends cleanup Close only after a validated exact Offer; uncertain canceled Opens retain bounded state for a late Offer. Pending channel reservations conservatively block management. These client restrictions preserve compatibility with older relay behavior.
- **P2 — Explicit Open rejection retains an active tombstone:** a correlated `CHANNEL_PAIR_EXISTS` result must release the never-created channel's reservation. The revised client marks both the Open and Offer states false and retires locally without leaving an active tombstone. Uncertain timeout remains a separate state.
- **P1 — Closed control overtakes a late Offer:** the revised retired-Offer decision distinguishes `AlreadyClosed` from `Close`, so a valid late Offer after an urgent ChannelClosed is consumed without sending another unknown-channel Close to an older server.
- **P1 — Canceled management controls lose their owner:** outstanding management control IDs were local to the canceled future; a delayed correlated Error could reach the actor as an unknown Error and reconnect the entire socket. The revised DeferredMessages owner records exact IDs, connection scope, channel and Open classification before `send_control` can await. Its table has a 1024-record bound and MemoryBudget leases. The actor consumes only exact current-scope management IDs; unknown Agent IDs remain subject to the original strict handling. Cleanup controls are recorded as well. Canceled Open rejection releases its never-created channel reservation; repeated matching errors remain idempotent.

All four client repairs above were inspected after implementation. No additional actionable P1/P2 remained in that inspected client increment. The client owner's log `output/backend-recovery-20261017/client-p1-cleanup-tests.log` was read and confirms **118 passed, 0 failed, 60 filtered out**, 2.57 seconds, for:

```sh
cargo test --manifest-path src-tauri/headless-network/Cargo.toml --locked agent_network:: --no-fail-fast
```

That suite includes real loopback WebSocket and inner-TLS checks for cleanup/late-error isolation and continued Agent payload delivery, plus scoped cancellation, duplicate error, retirement-budget and cross-profile cases. The client owner was making a test-only `tokio::spawn` to `tokio::join!` adjustment for the repository lint boundary and rerunning its checks. This reviewer did not independently run the complete native client suite. The harness compiles the actual shared channel/pairs/controller modules; full Desktop actor compilation and installed two-App business acceptance remain separate gates.

## Return pair contention follow-up

A later read-only review confirmed a P2 in TargetReturns: `CHANNEL_PAIR_EXISTS` / `CHANNEL_ALREADY_OPEN` for an Open left its probe or pending delivery in `Opening`. `advance` could reuse a subsequently Ready Agent channel, but could create a new channel only from `Waiting`. If the existing same-pair channel was management, `Pairs::ready_for` excluded it; when it closed, the failed Open's distinct random channel ID never received a matching close. The management close branch also returned before ordinary TargetReturns dispatch. Thus the return remained Opening even after management completed, until its original recovery deadline expired. A later terminal callback could inherit that stale opening from the deduplication map.

The lead repaired this in the existing TargetReturns owner. A matching Open rejection transitions every probe and pending delivery sharing that control ID to Waiting and assigns the same 10-second `open_after`. The Ready Agent reuse branch runs before this timer check; only creation of a new Open waits for backoff. A disconnect or actual resumed epoch/suspension transition clears the transport backoff while preserving the original recovery deadline. No original start/send, event body, event ID or execution authority is recreated, and management is not evicted. Static review found no additional actionable P1/P2 in this repair.

The lead's red log `return-busy-pair-red.log` fails at the new requirement that the rejected shared Open leave a delivery in Waiting. Its green log `return-state-final-busy-pair.log` records **31 passed, 0 failed**. The actual manifest is `/tmp/moxbots-backend-return-state-20261017/Cargo.toml`, whose lib directly includes this backend checkout's current `returns.rs` and `memory.rs`; the reviewer read and confirmed those paths. `CARGO_TARGET_DIR=/tmp/moxbots-return-state-harness-20261017/target` reuses only compilation cache and does not select the old harness's source.

The two added tests are `busy_pair_releases_every_shared_return_open_without_losing_the_result` and `callback_after_rejected_probe_obeys_the_same_pair_backoff`. They cover both rejection codes, a pending result plus two probes sharing one Open, unrelated management-channel closure, no immediate retry, one fresh Open after backoff, unchanged outage deadlines, unchanged event ID/body and settlement ACK, and a callback arriving only after probe rejection. These are production-source state tests with inert App/watch/transport shells. Ready-channel preference was reviewed in source; this harness stubs `Pairs::ready_for` to None and does not establish an actual management/socket or installed-App acceptance path.

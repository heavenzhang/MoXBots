# MOXBOTS-MOBILE-002 — original desktop notification source

Source branch `codex/desktop-mobile-notify-source-20261021`; base `ba97a22b4338383dd8eb29c71d814f3edd3c422a` in the human-confirmed MoXBots repository. This is a later source batch, excluded from frozen516.6. Desktop owner01a12bc2 retains shared CI/build/main/install; mobile owner01a12b99 retains phone signing/acceptance and the existing cloud scope. This lane performed no device, cloud, shared CI or release operation. The unknown peer remains untouched.

## Problem and production path

The headless Host already observes original worker events in `src/host/main.ts` and publishes the existing generic source protocol through its connector. Desktop had the bounded `OwnedClient::notification_source_request` adapter but no production publisher or Session event handoff.

`notification::submit_session_completion` now hands the original terminal to the desktop source **after** the existing eligibility check and **before** desktop-focus suppression. Both the public crate hook and connection method require the original opaque `SessionCompletionClaim`; no UI route or OS toast creates this authority. Existing completion claims, generation/dedup policy, task/goal/channel exclusions and desktop toast behavior are unchanged.

The original network actor owns activation, identity, connection epoch, readiness, one optional in-flight publication and disconnect cleanup. Pending interactions come from the existing read-only original live Session projection, checked against its Session/generation both after HTTP and before durable handoff. No Sidecar is created, task dispatched, approval answered or execution state changed. Up to four live Sessions are inspected per pass with rotating selection, bounded existing HTTP projections, a20-second total deadline, existing shared memory accounting and2-to60-second failure backoff. A failed pending projection does not suppress an independently verified queued completion.

Independent review of the first source head found two defects; that head was **not accepted**. The repaired selection skips only the original Global precheck's exact `SESSION_NOT_FOUND` and `AGENT_NOT_AVAILABLE` domains, preserving those unconfirmed pointers while considering later valid candidates. Identity conflicts, unknown/authority and infrastructure failures remain closed. The old `REMOTE_*` names belonged to another error domain and are not used as substitutes.

Connection identity activation is separate from permission to publish. A once-valid, one-way policy lease is issued only by the original actor's accepted hydrate/current Ready lifecycle. Settings/Catalog changes, accepted catalog replacement and local catalog-change notification revoke it immediately. Discovery/challenge completion, pre/post signing, hint completion and the actual acknowledgement store commit recheck this same lease. Fresh accepted policy creates a new lease; it cannot revive the old worker. The existing connection RAII remains bound to identity/connection/generation before Ready, so it cleans up even when no policy was ever accepted and cannot clear a successor connection. The source service's device proof does not replace these mount/join policy checks.

A second independent review rejected the first repair: a synchronous local catalog change invalidated the lease, but an already-running metadata result could arrive before its Notify arm, leave the actor's old dirty/sequence fields unchanged and mint another lease. The source now captures a monotonic policy revision **at hydrate launch**, carries it with the Work result and accepts only that exact version under the policy lock. A separate synchronous local catalog revision is compared with the actor's already-observed revision, so a job launched after an unconsumed local notification also stays closed. Only initial catalog setup or consumption of the original Notify/read path advances that observed revision. Ready uses the version retained from the accepted hydrate result; it cannot obtain the latest revision to authorize an older snapshot. Catalog/settings acceptance and connection retirement clear or invalidate the snapshot. Exhaustion/poison rejects new admission; old workers remain revoked. This source permission fence does not replace or rewrite the original broader network policy owner.

Publication resolves a unique active workspace/Agent from the original catalog and current enabled mount policy, revalidates exact Session/workspace authority through the original precheck, obtains the existing source challenge, revalidates after asynchronous work, signs with the original device key, posts the existing hint, then acknowledges the durable pointer only after a strict service confirmation. Provider-disabled/error paths retain the pointer and never announce delivery.

## Owner and persistence boundary

The new Rust `DesktopNotificationSource` is the desktop adapter for the existing notification source/outbox responsibility. It owns only a private generic-pointer delivery projection, not Session, execution, account, catalog, permissions or provider configuration. It does not read or co-write the Node Host outbox and adds no IPC/HTTP/SSE mode or wire format.

Desktop storage is under the existing application data directory's `desktop-mobile-notify-source-v1/<canonical connection UUID>/`. Its filenames hash the full issuer/service/environment/network/principal/device/key-generation/account-binding scope. New directories are0700, files0600 with same-UID, regular-file, no-follow and single-hardlink checks. Atomic private temporary-file replacement and file/directory sync precede acceptance. Reads are bounded to512KiB; pending128, confirmed512, TTL24h. Capacity/corruption/unsafe storage is explicitly unconfirmed; no old pointer is silently evicted to claim success. Windows activation is disabled pending its native private-ACL provisioner, matching the existing asset-store boundary; this task targets the current Mac.

| Existing Node Host | Desktop Rust adapter |
|---|---|
| Original non-Bot child/generation and bounded pending replay | Original opaque completion claim and original live Session/generation pending projection |
| Private Host state directory, version2 | Separate desktop directory, version1; formats are not shared |
| Worker/session/observation dedup; terminal observation has a fresh event label | Session/real turn dedup for completion; generation/turn/request for pending |
| Pending128, deferred128, confirmed512,24h TTL | Pending128, no deferred overflow, confirmed512,24h TTL; explicit capacity failure |
| Captured source scope and original pointer ID | Full identity/account scope; the same durable source ID is re-proved under the current connection epoch after reconnect |

A retired epoch/lifetime cannot clear a successor activation, including reconnects within the same actor generation. Logout/account/key/issuer boundaries reject the old activation. Reconnect recovery does not retarget a pointer to another identity. Private records contain source/session IDs, local workspace path, observation hash and timestamps; no token, transcript, answer, title, provider key or topic. Wire payloads use the pre-existing explicit generic pointer/proof fields only. A local `confirmed` record means **source acceptance by the service**, never APNs acceptance or visible phone delivery.

## Verification and limits

- The runnable contract script reads the actual unchanged dispatcher function body and eligibility policy, and compiles the actual queue. Its platform/AppState/error/opaque-claim adapters are isolated test fixtures. It is not a real Tauri manager or native authority test.
- Baseline dispatcher from the pinned base: focused-source assertion actually failed with exit101; compilation failures are explicitly not RED. The dispatcher/queue suite now passes13 cases. It includes policy revocation at the store commit boundary in addition to focus/background, eligibility, restart/reconnect, scope, capacity, corruption and private storage checks.
- The added flow runner compiles the actual original Node precheck/schema and shared visibility/workspace helpers with isolated registry/history inputs. Its genuine response shapes feed the actual Rust selection/validation functions. It also executes the actual proof sequence and original actor dirty/hydrate/Ready bodies and the actual launch-version expression with isolated HTTP/signing/platform adapters. The reviewed, unfixed behavior actually failed five of19 cases; that first repair passed19 but was subsequently rejected by the independent unconsumed-notification probe. The original f805 production probe was independently rerun with only its queue dependency pinned to f805:20 cases,19 PASS and one actual `UNCONSUMED_LOCAL_DIRTY_ACCEPTED_STALE_POLICY` failure (exit101). The revised current source passes24 cases. These include four dirty sources during challenge, a change after challenge validation before signing, hint-response/ack timing, disabled service, not-Ready/stale hydrate and original connection RAII/successor cleanup. Added cases retain dirty=false and an unchanged sequence while checking old in-flight result, a new launch before Notify consumption, Ready after dirty, and recovery after actual Notify consumption plus a fresh accepted hydrate. Ten queue cases are shared with the dispatcher suite; the two suite totals are not37 unique cases.
- Complete desktop crate `cargo check --release --tests --locked --offline` PASS using the unbranded `myagents` profile and an isolated target. This does not execute the production credential reader or an App.
- Matching local release/all-targets Clippy with the project's disallowed-method/macro redlines PASS; new Rust files pass scoped format check, script syntax and diff whitespace checks PASS.
- Dependencies were copied read-only from an owner-authorized inactive cache to an isolated target. Signed public CLIProxy inputs were copied for build-script validation; inert local resource placeholders were used only for type checking, never as a distributable package. No old App/Reader was executed.

Reproduce the contract with a pinned, explicitly verified native Rust dependency directory and an optional JSON manifest mapping each dependency to its exact `file` and `sha256`:

```sh
node scripts/test-desktop-mobile-notify-source.mjs --deps-dir /ABS/DEPS --extern-manifest /ABS/MANIFEST.json
```

The script fails closed on changed source anchors/signatures, ambiguous artifacts, digest mismatches or compilation failure. It has bounded compiler/test timeouts, fresh private temporary outputs and no implicit Cargo, CI or shared-cache writes. For historical RED, pass the actual baseline dispatcher file via `--dispatcher-source /ABS/BASELINE.rs --expect-red`. Reports include actual source/dependency digests and adapter boundaries.

The flow runner additionally needs a verified existing Node dependency directory (esbuild/zod) and the explicit Tokio artifact in its Rust manifest:

```sh
node scripts/test-desktop-mobile-notify-flow.mjs --deps-dir /ABS/DEPS --extern-manifest /ABS/FLOW-MANIFEST.json --node-modules /ABS/NODE_MODULES
```

Its historical `--delivery-source /ABS/REVIEWED-UNFIXED.rs --legacy-unfenced --expect-red` adapter changes the test call signature only; actual production function bodies and guards are never rewritten. Fixture I/O, signer and actor platform remain substitutes. Successful execution proves the tested source sequencing and state decisions, not native actor dispatch, cryptographic service verification or notification delivery.

**Still required:** independent source review; owner-selected next candidate and exact post-integration CI; production-profile/package validation; safe current-Mac installation; current cloud/APNs configuration and authorized existing key availability; actual Mac event/source/service confirmation; original iPhone background alert, tap to the same Session, cold start and logout revocation. Login, real new/continued conversations, file/image upload/digest/result preview, approvals and microphone acceptance remain separately open. No source/local check closes those gates.

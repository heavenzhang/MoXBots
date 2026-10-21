# MOXBOTS-MOBILE-002 — original desktop notification source

Source branch `codex/desktop-mobile-notify-source-20261021`; base `ba97a22b4338383dd8eb29c71d814f3edd3c422a` in the human-confirmed MoXBots repository. This is a later source batch, excluded from frozen516.6. Desktop owner01a12bc2 retains shared CI/build/main/install; mobile owner01a12b99 retains phone signing/acceptance and the existing cloud scope. This lane performed no device, cloud, shared CI or release operation. The unknown peer remains untouched.

## Problem and production path

The headless Host already observes original worker events in `src/host/main.ts` and publishes the existing generic source protocol through its connector. Desktop had the bounded `OwnedClient::notification_source_request` adapter but no production publisher or Session event handoff.

`notification::submit_session_completion` now hands the original terminal to the desktop source **after** the existing eligibility check and **before** desktop-focus suppression. Both the public crate hook and connection method require the original opaque `SessionCompletionClaim`; no UI route or OS toast creates this authority. Existing completion claims, generation/dedup policy, task/goal/channel exclusions and desktop toast behavior are unchanged.

The original network actor owns activation, identity, connection epoch, readiness, one optional in-flight publication and disconnect cleanup. Pending interactions come from the existing read-only original live Session projection, checked against its Session/generation both after HTTP and before durable handoff. No Sidecar is created, task dispatched, approval answered or execution state changed. Up to four live Sessions are inspected per pass with rotating selection, bounded existing HTTP projections, a20-second total deadline, existing shared memory accounting and2-to60-second failure backoff. A failed pending projection does not suppress an independently verified queued completion.

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
- Baseline dispatcher from the pinned base: focused-source assertion actually failed with exit101; compilation failures are explicitly not RED. Current source:11 related contract/queue cases PASS, covering focus/background, original task/goal exclusions, restart/reconnect source ID, issuer/account/device/key/network isolation, retired cleanup, missing private storage, stale pending generation, capacity, corrupt files and unsafe links/permissions.
- Complete desktop crate `cargo check --release --tests --locked --offline` PASS using the unbranded `myagents` profile and an isolated target. This does not execute the production credential reader or an App.
- Matching local release/all-targets Clippy with the project's disallowed-method/macro redlines PASS; new Rust files pass scoped format check, script syntax and diff whitespace checks PASS.
- Dependencies were copied read-only from an owner-authorized inactive cache to an isolated target. Signed public CLIProxy inputs were copied for build-script validation; inert local resource placeholders were used only for type checking, never as a distributable package. No old App/Reader was executed.

Reproduce the contract with a pinned, explicitly verified native Rust dependency directory and an optional JSON manifest mapping each dependency to its exact `file` and `sha256`:

```sh
node scripts/test-desktop-mobile-notify-source.mjs --deps-dir /ABS/DEPS --extern-manifest /ABS/MANIFEST.json
```

The script fails closed on changed source anchors/signatures, ambiguous artifacts, digest mismatches or compilation failure. It has bounded compiler/test timeouts, fresh private temporary outputs and no implicit Cargo, CI or shared-cache writes. For historical RED, pass the actual baseline dispatcher file via `--dispatcher-source /ABS/BASELINE.rs --expect-red`. Reports include actual source/dependency digests and adapter boundaries.

**Still required:** independent source review; owner-selected next candidate and exact post-integration CI; production-profile/package validation; safe current-Mac installation; current cloud/APNs configuration and authorized existing key availability; actual Mac event/source/service confirmation; original iPhone background alert, tap to the same Session, cold start and logout revocation. Login, real new/continued conversations, file/image upload/digest/result preview, approvals and microphone acceptance remain separately open. No source/local check closes those gates.

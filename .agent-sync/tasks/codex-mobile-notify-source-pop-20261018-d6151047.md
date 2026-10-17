<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-notify-source-pop-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=complete -->

# Task: Device-attested source for mobile notifications

## Objective

Add default-disabled, provider-gated HTTP source challenge and hint endpoints within `services/agentnet`. A logged-in device must prove possession of its currently enrolled DeviceStore key before a fixed session pointer can enqueue a generic notification hint. No public route is mounted unless existing mobile notification runtime configuration enables it.

## Scope

- Owned files: notification core, `mobile_notification_http.rs`, notification docs, this task record.
- Do not change Host source integration, SDK/app, frozen crypto/protocol/vendor closure, provider credentials, or production deployment.
- PoP proves device-key possession only. It does not prove the caller is Host software or that an Agent/session pointer is genuine. The mobile client must still refresh catalog/session state before presenting an actionable item.

## Acceptance criteria

- `POST /api/mobile-notify/v1/source/challenges` accepts only closed versioned JSON `{version,sourceEventId,connectionEpoch,agentId,sessionId}` and returns 201 `{version,challengeId,nonce,expiresAt}` after durable challenge-to-scope/pointer binding.
- `POST /api/mobile-notify/v1/source/hints` accepts only `{version,challengeId,proof}`, rechecks live AuthStore session and exact current DeviceStore owner/generation, consumes a RecoverQuery proof, then enqueues only the stored pointer and returns 200 `{version,eventId}`.
- Both success and error responses carry `Cache-Control: no-store, max-age=0`; no caller-supplied principal, network, source/target device, or alternate pointer is accepted.
- Fresh challenge is required after proof consumption without a durable receipt; exact sourceEventId/epoch/pointer retries deduplicate, while changed epoch/pointer conflicts.
- Device challenge creation is preceded by notification preflight checks, preventing rejected content conflicts from exhausting DeviceStore pending challenge quota.
- Store uses bounded TTL/quota/cleanup and persists scope and pointer before exposing nonce.
- Both challenge binding and final receipt now require a committed DB readback of exact scope/pointer/state; mismatches fail as fixed unavailable before returning nonce or success.

## Completed

- Added source challenge reservation, durable receipt and crash-recovery state to mobile-notify-core schema v3.
- Added service-owned PoP endpoints with fresh live session and DeviceStore state checks, closed request structs, provider-enabled gate, fixed errors, and no-store middleware.
- Added tests backed by real temporary AuthStore, DeviceStore, and SQLite stores. Coverage includes no claimed key, wrong account/session/device, key rotation, identity challenge isolation, invalid proof consumption, store reopen, lost-receipt re-challenge and event dedupe, provider-disabled behavior, and rejected-source preflight quota protection.
- Documented the device-attested HINT trust boundary and remaining Host ownership gap.

## Verification

- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo fmt --manifest-path services/agentnet/Cargo.toml` — passed.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/Cargo.toml --lib mobile_notification_http::tests` — 10 passed.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/mobile-notify-core/Cargo.toml` — 17 passed, including SQLite-trigger corruption/readback regressions.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/Cargo.toml --lib` — 175 passed, 5 ignored (manual fixtures), before the readback-only core repair.
- After the readback repair, focused service HTTP tests — 10 passed.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo clippy --manifest-path services/agentnet/Cargo.toml --all-targets -- -D warnings` — passed.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo fmt --manifest-path services/agentnet/Cargo.toml --check` and `git diff --check` — passed.

## Blockers and unknowns

- The Host-owned source sender is being integrated separately and is not part of this task. No real Host-to-service end-to-end test has been run.
- No production route/configuration, APNs/FCM credentials or network delivery has been enabled or exercised.
- This API cannot establish Host software role or validate private Agent/session ownership; that must be guaranteed by the Host's owned source path and followed by the app's fresh catalog/session checks.

## Next step

Root should review and integrate the owned commits; Host sender remains a separate integration gate.

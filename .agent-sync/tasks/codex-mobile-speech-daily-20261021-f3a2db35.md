<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-speech-daily-20261021 -->
<!-- git-project-sync-task:base=29cb959d784d868190c03181ae8f3fc79490e6b2 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOBILE-002 iOS speech diagnostics preparation for daily Mac acceptance

## Objective

Prepare the existing iOS speech lifecycle and privacy-preserving diagnostic repair against current main for full MOBILE-002 daily Mac acceptance. The human selected this Mac's existing Bot and explicitly included speech and background notifications. Core connection/session/files remain first in the mobile execution owner's current batch; this source preparation does not expand that frozen batch.

Repository https://github.com/heavenzhang/MoXBots.git; base29cb959d784d868190c03181ae8f3fc79490e6b2. Source worker01a1488b-c673-79f1-abd5-018938f2ee92 owns only the two Swift speech files and their dedicated test/preflight additions in this worktree. Mobile sole CI/version/build/sign/install/device owner remains01a12b99-7b38-78b1-831f-9c60257d386a; desktop owner01a12bc2 unchanged. Mobile owner confirmed no concurrent Swift ASR writer.

## Acceptance criteria

- Preserve on-device-only recognition, original capture limits, permissions, cancellation and generation fencing.
- Establish the recognition consumer before engine production and stop producer/tap before EOF.
- Emit only closed domain families, integer error codes and per-attempt input flags. Never retain/log audio, transcript, localized errors or userInfo.
- Pass dedicated native counter/privacy/concurrency checks and real device/simulator SDK Swift typechecks without microphone/device/signing/runtime operations.
- Commit/push a reviewable source-only handoff. Physical microphone-to-editable-text-to-send acceptance, current candidate CI/main integration and a new signed build remain separate mobile-owner gates.

## Completed

- Reused the native portion of ba578a5ea37cc6c0e685ab4f7617de22e2686264; did not blindly cherry-pick its old app/index.tsx patch, which fails against current conversation UI.
- Source/native changes and dedicated tests prepared. No core JS/receipt/connection behavior, existing signing data or daily Mac runtime/config changed.
- Dedicated native diagnostic tests passed (no-input/silence/signal/unknown-format/privacy/negative-code/concurrency/attempt-isolation); both Swift files typecheck without warnings against actual iphoneos27.1 and iphonesimulator27.1 SDKs.

## Verification

- Git Project Sync observe/start/task-init passed against the human-confirmed repository and current canonical base.
- `node mobile/scripts/test-ios-speech-diagnostics.mjs`: PASS; harness Node22.23.0, actual compiled Swift executable. This is not a product JS/Node24 or full Expo test claim.
- `xcrun swiftc -typecheck -swift-version5` for the two exact speech sources: PASS at arm64-apple-ios16.4/iphoneos27.1 and arm64-apple-ios16.4-simulator/iphonesimulator27.1, isolated temporary module caches, no stderr. No Rust target installation or full app rebuild performed.
- No shared CI, formal build, signing, version allocation, installation or phone/UI operation by this source worker.

## Blockers and unknowns

- Installed build2 does not contain this source. Old generic recognition failures do not identify a root cause, and this preparation does not prove a real-device repair.
- App error-display integration remains with the mobile execution owner, preserving its current index.tsx work. The old ba578a5e mobilePolicy error formatter and app hook may be adapted in that later batch; they are deliberately not applied by this native-only handoff.
- Any changed artifact needs a new build identity and exact-source provenance; preserve immutable internal build2 and its rollback.

## Next step

- After core session/file acceptance, mobile owner reviews the native source handoff, adapts its closed error formatter to current app UI, assigns the next build, and performs one controlled real-microphone reproduction. Use the actual bounded diagnostic result to repair the measured failure; do not repeat old-package recordings or silently switch to cloud ASR.

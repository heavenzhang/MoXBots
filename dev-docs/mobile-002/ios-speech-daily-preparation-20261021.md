# iOS speech preparation for daily Mac acceptance

MOBILE-002 remains open. This source-only change reuses the native portion of ba578a5e against main29cb959d. It is prepared independently while sole mobile owner01a12b99 verifies current Mac connection, real session exchange and files. It does not change that owner's current candidate or operate the daily Mac, phone, signing account or notification provider.

The previous build2 collapsed asynchronous Speech errors to one generic code. Without the original NSError family/code and evidence of microphone input, its failed readings cannot establish an OS/root cause. The new per-attempt helper retains only frames/nonzero-input flags and maps errors to a closed family plus integer code. Descriptions, userInfo, raw domain strings, audio and transcript never enter the diagnostic projection. Dedicated tests exercise empty/silent/nonzero/unknown input, private custom errors, negative-code bounds, concurrency and attempt isolation.

Capture establishes the recognition task before starting the audio engine. Stop quiesces the engine and removes its tap before marking EOF. Existing on-device-only recognition, supported languages, generation/cancellation guards and60-second capture/12-second finalization limits remain. These are lifecycle hardening and diagnostic changes, not proof of a repaired physical failure.

## Integration boundary

This handoff intentionally leaves current app/index.tsx and mobilePolicy untouched. Blind application of the old complete ba578a5e mobile patch fails against the current conversation UI. The mobile owner can reuse its small closed-code error formatter when preparing the later speech candidate, preserving all conversation guards and its current branch changes. The helper must be included in the full Expo/Pods native build; shared real-SDK preflight discovers the Swift files dynamically.

Local verification is limited to the dedicated executable and real-device/simulator SDK typechecks. No microphone permission prompt, audio capture, simulator launch, Rust target installation, CI dispatch, signing or installation is part of this source preparation. Later acceptance must cover actual microphone input to editable text, explicit send, cancel, denied permissions and background interruption on the selected real phone. A new artifact/build identity is required for the changed native source; immutable build2 is retained.

The dedicated compiled Swift test passed on2026-10-21 (JS harness Node22.23.0; no product JS claim). Both exact changed Swift files passed warning-free typechecks using the installed actual iphoneos27.1 and iphonesimulator27.1 SDKs, deployment targets16.4, with isolated temporary module caches. Full Expo/Pods/CI and physical speech acceptance remain open.

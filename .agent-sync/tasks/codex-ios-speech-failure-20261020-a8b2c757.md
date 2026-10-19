<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/ios-speech-failure-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-IOS-SPEECH-FAILURE-20261020

Parent: MOXBOTS-IPHONE-ACCEPTANCE-20261019. Repository https://github.com/heavenzhang/MoXBots.git; canonical main; task branch codex/ios-speech-failure-20261020; original development base18e13ce8dbad20e61af3f84173ad87d84bf090a6.

## Objective

Diagnose and repair the two reproduced real-iPhone speech failures while retaining the human account, original101 identity/configuration and daily Mac runtime. No message sending or business execution.

## Acceptance criteria

- [x] Preserve two human dictation failures on installed0.1.0/build1/source18e; native error MOBILE_SPEECH_RECOGNITION_FAILED, no recognized text.
- [x] Harden consumer/producer start and stop ordering; add bounded, non-content diagnostics and correct local speech error guidance.
- [x] Pass Swift device/simulator SDK typecheck, native diagnostic privacy/concurrency/isolation tests, JS type/lint and63 policy tests.
- [ ] Independent review, integration with latest main and layout1d67241b, combined CI and remote-main containment.
- [ ] New immutable signed internal phone candidate from the integrated source, preserving login.
- [ ] Actual human Chinese speech -> recognized editable draft; finish/cancel/retry/background behavior and no auto-send. This gate currently FAILS on installed build1.

## Completed

Local source hardening and focused verification. Detailed findings and limitations: dev-docs/mobile-002/ios-speech-failure-20261020.md. No claim that the ordering changes resolve the observed recognition failure. The old code discarded NSError domain/code; a new candidate is needed for safe diagnosis.

## Verification

Swift5 typecheck passes for arm64-apple-ios16.4 device and simulator using Xcode iOS27.1 SDK. node mobile/scripts/test-ios-speech-diagnostics.mjs passes: no frames, silence, signal, unavailable sample data, closed error-domain/numeric-code projection, Int.min,10,000 concurrent observations, new-attempt isolation. JS npm typecheck/lint and63 policy tests pass. Synthetic AF1101 test value is NOT an observed phone error. No recognition accuracy is established by these tests.

## Blockers and unknowns

Shared CI/version/build/install coordinator for the current mobile batch:01a12bc2-907a-7702-b6dd-788225c5dfe4, explicitly chosen by the human. Implementation/phone evidence owner:01a12b99-7b38-78b1-831f-9c60257d386a. Latest per-deployment-unit policy applies; this record does not reassign cloud/Host/desktop units. No independent shared CI, formal build/install or release from this implementation lane.

Existing WIP began at18e. The task-init helper was attempted after main advanced to70eb592f and correctly refused dirty/stale-start state; it did not create a record. This continuity record preserves the actual existing work and original base; the final handoff gate and owner current-main integration must still pass. Do not report task-init as passed.

Chinese recognition remains failed/unaccepted; underlying OS error and input signal are unknown on build1. Do not silently enable network recognition, download system models, weaken permissions or change the user account. Physical file-to-Host acceptance is separate and pending. Daily Mac, cloud, original101 and other devices are excluded.

## Next step

Commit/push these scoped changes; run exact-remote handoff gate; deliver SHA and evidence to the designated coordinator for independent review, combination with layout, current-main CI and phone candidate allocation. Resume physical speech only on the verified new candidate, then use its bounded diagnostic to repair remaining actual failures. Private screenshots/logs stay under project output/iphone-acceptance-20261019, outside Git.

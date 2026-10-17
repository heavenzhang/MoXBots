<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-speech-readiness-002-20261018 -->
<!-- git-project-sync-task:base=3e10fd5ea6a4a5c6caf5e15b9a4013f300e760fb -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 Android speech readiness and permission-denied validation

## Objective

Independently probe Android's real on-device recognition readiness on the dedicated emulator and verify the real NativeSpeech permission-denied path without recording. This support lane does not implement or rewrite ASR and does not close speech, physical-device, or production acceptance.

## Acceptance criteria

- [x] Worktree starts from the explicitly assigned root `3e10fd5ea6a4a5c6caf5e15b9a4013f300e760fb`, with a separate task branch and no primary-tree edits.
- [x] Probe reports API level, on-device service availability, current RECORD_AUDIO permission and API 33+ installed/pending/supported locale metadata for the `zh-CN` request, with bounded timeout/errors represented as unknown.
- [x] Use actual `NativeSpeech.start()` only when RECORD_AUDIO is already denied; require stable permission error, idle state, and no recording/transcript events. Never change permission state.
- [x] Leave implementation, generated native output, frozen crypto/protocol and production paths untouched; commit only the instrumented test, diagnostics evidence and this record.
- [x] Push this task branch and run git-project-sync handoff against the explicitly assigned base; record the existing canonical-main start-gate mismatch without rebasing.

## Completed

- Added `NativeSpeechReadinessInstrumentedTest.kt` under the real Expo module's Android instrumentation test source set.
- Mirrored the production config plugin's `android.speech.RecognitionService` query in the standalone library test manifest; verified it appears in the packaged AndroidTest manifest.
- Inspected the repository/module instructions, mobile plan and upstream speech task ledger; verified `origin` is the supplied GitHub URL and the new branch was based on the assigned clean HEAD.
- Reviewed Android's official `SpeechRecognizer` and `RecognitionSupport` API references. SDK 58 is in the app package; Expo prebuild generated the ignored native Android project. Built the ignored Android Rust dependency using the repository's provenance-producing build script.
- Tested on dedicated `emulator-5554`, Android API 36. The device reports on-device recognition available, RECORD_AUDIO denied, `en-US` installed, no pending Chinese locale, and `cmn-Hans-CN` among supported on-device locales. Chinese readiness is therefore `unavailable` until its model is installed.
- Actual `NativeSpeech.start()` failed closed with `MOBILE_SPEECH_PERMISSION_REQUIRED` and invoked the completion callback exactly once; the state remained idle with zero events. No recording, permission request/change, model download, external provider, or listening call occurred.
- Durable probe output and limitations are in `dev-docs/mobile-002/speech-readiness/`.

## Verification

- `project-sync.mjs observe --repo . --remote https://github.com/heavenzhang/MoXBots.git` — PASS for configured/fetch/push URL, branch and assigned HEAD.
- `project-sync.mjs start` and `task-init` with base `3e10fd5...` — BLOCKED by the tool's existing `stale_start_base` check because canonical remote main is `9269dd8...`; exact assigned parent-work branch base was preserved as instructed. Worktree-dirty also applies once the probe was added.
- Expo SDK 58 `prebuild --platform android --no-install` — PASS; generated `mobile/app/android` is ignored. Gradle recognized `:moxbots-remote`.
- `node mobile/scripts/build-native.mjs android` — PASS; created ignored native library and generated provenance stamp from current inputs.
- `:moxbots-remote:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.moxbots.mobile.remote.NativeSpeechReadinessInstrumentedTest` — PASS on API 36; this means the diagnostic assertions passed only.
- Exact one-command rerun is recorded in `dev-docs/mobile-002/speech-readiness/README.md`.
- `project-sync.mjs handoff --repo . --remote https://github.com/heavenzhang/MoXBots.git --base 3e10fd5...` — PASS; remote branch SHA equals this task head; task status remains `in-progress`.

## Blockers and unknowns

- Chinese local recognition is not ready on this AVD: no installed or pending Mandarin model. A supported-but-uninstalled locale is not readiness; model download was not triggered.
- Actual recording/transcription, transcript quality, physical Android device, iOS, editable draft, Host and production behavior remain unverified and out of this support lane.
- Git project-sync start gate records a mismatch between the assigned parent checkpoint and current canonical main. Do not rebase this support branch; the owning parent task selected the exact `3e10fd5...` base. Handoff gate result is recorded after push.

## Next step

Parent task owner reviews this bounded evidence and decides when a controlled, user-visible Chinese model installation and separate ASR capture validation can be authorized. This lane does not perform model installation or microphone capture. Emulator and Gradle access are returned to the parent; leave task status `in-progress` while overall MOXBOTS-MOBILE-002 acceptance remains open.
